const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const { requireStaff, requireOwner } = require('../middleware/auth');
const router = express.Router();

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', 'public', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `proof_${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ── Public: submit order ──────────────────────────────────────
router.post('/', (req, res) => {
  const {
    id, customer_name, customer_contact, order_type, notes,
    delivery_address, payment_method, items,
  } = req.body;

  if (!customer_name || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Missing required order fields' });
  }

  const orderId = id || uuidv4();

  // Idempotency: offline sync may re-send
  const existing = db.prepare('SELECT id, order_number FROM orders WHERE id = ?').get(orderId);
  if (existing) return res.json({ success: true, orderId, orderNumber: existing.order_number, duplicate: true });

  // Verify products + compute total
  let total = 0;
  const resolvedItems = [];
  for (const item of items) {
    const product = db.prepare('SELECT id, price FROM products WHERE id = ? AND is_active = 1').get(item.product_id);
    if (!product) return res.status(400).json({ error: `Product ${item.product_id} not found` });
    const qty = parseInt(item.quantity) || 1;
    const subtotal = product.price * qty;
    total += subtotal;
    resolvedItems.push({ product_id: product.id, quantity: qty, unit_price: product.price, subtotal, notes: item.notes || '' });
  }

  const insertOrder = db.transaction(() => {
    // Get next order number atomically
    const counterRow = db.prepare("SELECT value FROM settings WHERE key = 'order_counter'").get();
    const nextNum = parseInt(counterRow?.value || '0') + 1;
    db.prepare("INSERT INTO settings (key, value) VALUES ('order_counter', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(nextNum.toString());

    db.prepare(`
      INSERT INTO orders (id, order_number, customer_name, customer_contact, order_type, notes,
        delivery_address, payment_method, payment_status, total_amount, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      orderId, nextNum, customer_name, customer_contact || '', order_type || 'pickup',
      notes || '', delivery_address || '', payment_method || 'cash',
      payment_method === 'gcash' ? 'pending_verification' : 'unpaid', total
    );

    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, quantity, unit_price, subtotal, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const item of resolvedItems) {
      insertItem.run(orderId, item.product_id, item.quantity, item.unit_price, item.subtotal, item.notes);
    }

    db.prepare(`INSERT INTO order_status_history (order_id, status) VALUES (?, 'received')`).run(orderId);

    return nextNum;
  });

  const orderNumber = insertOrder();
  res.json({ success: true, orderId, orderNumber, total });
});

// ── Public: get single order with items + history ─────────────
router.get('/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const items = db.prepare(`
    SELECT oi.*, p.name as product_name FROM order_items oi
    JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?
  `).all(req.params.id);

  const history = db.prepare(`
    SELECT osh.*, u.name as changed_by_name FROM order_status_history osh
    LEFT JOIN users u ON u.id = osh.changed_by
    WHERE osh.order_id = ? ORDER BY osh.changed_at ASC
  `).all(req.params.id);

  res.json({ ...order, items, history });
});

// ── Public: submit GCash payment proof ───────────────────────
router.post('/:id/payment-proof', upload.single('proof'), (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const { gcash_reference } = req.body;
  const proof_url = req.file ? `/uploads/${req.file.filename}` : order.payment_proof_url;

  db.prepare(`
    UPDATE orders SET gcash_reference = ?, payment_proof_url = ?, payment_status = 'pending_verification' WHERE id = ?
  `).run(gcash_reference || order.gcash_reference, proof_url, req.params.id);

  res.json({ success: true });
});

// ── Staff: list orders — items embedded, single query ─────────
router.get('/', requireStaff, (req, res) => {
  const { status, date, search } = req.query;
  let sql = `
    SELECT o.*,
      json_group_array(
        CASE WHEN oi.id IS NOT NULL THEN
          json_object('product_name', p.name, 'quantity', oi.quantity,
                      'subtotal', oi.subtotal, 'notes', oi.notes)
        ELSE NULL END
      ) as items_json,
      COUNT(DISTINCT oi.id) as item_count
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE 1=1
  `;
  const params = [];

  if (status && status !== 'all') { sql += ' AND o.status = ?'; params.push(status); }
  if (date) { sql += ' AND date(o.created_at) = ?'; params.push(date); }
  if (search) {
    sql += ' AND (o.customer_name LIKE ? OR o.id LIKE ? OR CAST(o.order_number AS TEXT) LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += ' GROUP BY o.id ORDER BY o.created_at DESC LIMIT 200';

  const orders = db.prepare(sql).all(...params).map(o => {
    let items = [];
    try {
      const parsed = JSON.parse(o.items_json || '[]');
      items = parsed.filter(i => i !== null);
    } catch {}
    return { ...o, items_json: undefined, items };
  });

  res.json(orders);
});

// ── Staff: update order status ────────────────────────────────
router.patch('/:id/status', requireStaff, (req, res) => {
  const { status } = req.body;
  const valid = ['received', 'preparing', 'ready', 'completed', 'cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (status === 'preparing' && order.payment_method === 'gcash' && order.payment_status !== 'verified') {
    return res.status(400).json({ error: 'GCash payment must be verified before preparing' });
  }

  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  db.prepare(`INSERT INTO order_status_history (order_id, status, changed_by) VALUES (?, ?, ?)`).run(
    req.params.id, status, req.session.user.id
  );

  res.json({ success: true });
});

// ── Staff: verify GCash payment ───────────────────────────────
router.patch('/:id/verify-payment', requireStaff, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  db.prepare(`
    UPDATE orders SET payment_status = 'verified', verified_by = ?, verified_at = datetime('now') WHERE id = ?
  `).run(req.session.user.id, req.params.id);

  res.json({ success: true });
});

module.exports = router;
