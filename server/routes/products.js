const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { requireOwner, requireStaff } = require('../middleware/auth');
const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');
require('fs').mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `product_${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpeg|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only PNG, JPG, or WEBP images are allowed'));
  },
});

// Staff/owner: list all products with category
router.get('/', requireStaff, (req, res) => {
  const products = db.prepare(`
    SELECT p.*, c.name as category_name FROM products p
    JOIN categories c ON c.id = p.category_id
    ORDER BY c.sort_order, p.sort_order, p.name
  `).all();
  res.json(products);
});

// Owner: create product
router.post('/', requireOwner, upload.single('image'), (req, res) => {
  const { category_id, name, description, price, is_active } = req.body;
  if (!category_id || !name) return res.status(400).json({ error: 'category_id and name required' });
  const image_url = req.file ? `/uploads/${req.file.filename}` : null;
  const result = db.prepare(`
    INSERT INTO products (category_id, name, description, price, is_active, image_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(category_id, name, description || '', parseFloat(price) || 0, is_active === '0' ? 0 : 1, image_url);
  res.json({ success: true, id: result.lastInsertRowid });
});

// Owner: reorder products — MUST be before /:id to avoid route conflict
router.patch('/reorder', requireOwner, (req, res) => {
  const items = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected array' });
  const update = db.prepare('UPDATE products SET sort_order = ? WHERE id = ?');
  for (const { id, sort_order } of items) update.run(sort_order, id);
  res.json({ success: true });
});

// Owner: update product
router.patch('/:id', requireOwner, upload.single('image'), (req, res) => {
  const { name, description, price, is_active, category_id } = req.body;
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  const image_url = req.file ? `/uploads/${req.file.filename}` : existing.image_url;

  db.prepare(`
    UPDATE products SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      price = COALESCE(?, price),
      is_active = COALESCE(?, is_active),
      category_id = COALESCE(?, category_id),
      image_url = ?
    WHERE id = ?
  `).run(name, description, price != null ? parseFloat(price) : null,
    is_active != null ? parseInt(is_active) : null, category_id, image_url, req.params.id);

  res.json({ success: true });
});

// Owner: delete product (hard delete — removes image file too)
router.delete('/:id', requireOwner, (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  // Delete associated image file from disk
  if (product.image_url) {
    const fs = require('fs');
    const imgPath = require('path').join(__dirname, '..', '..', 'public', product.image_url);
    try { fs.unlinkSync(imgPath); } catch {}
  }

  db.prepare('DELETE FROM recipes WHERE product_id = ?').run(req.params.id);
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Owner: get product recipe with costing
router.get('/:id/recipe', requireOwner, (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const recipe = db.prepare(`
    SELECT r.*, i.name as ingredient_name, i.unit, i.cost_per_unit,
           (r.quantity_used * i.cost_per_unit) as line_cost
    FROM recipes r
    JOIN ingredients i ON i.id = r.ingredient_id
    WHERE r.product_id = ?
  `).all(req.params.id);

  const total_cost = recipe.reduce((sum, r) => sum + r.line_cost, 0);
  const margin = product.price > 0 ? ((product.price - total_cost) / product.price) * 100 : null;

  res.json({ product, recipe, total_cost, margin });
});

// Owner: add/update a recipe line
router.post('/:id/recipe', requireOwner, (req, res) => {
  const { ingredient_id, quantity_used } = req.body;
  if (!ingredient_id || quantity_used == null) {
    return res.status(400).json({ error: 'ingredient_id and quantity_used required' });
  }
  db.prepare(`
    INSERT INTO recipes (product_id, ingredient_id, quantity_used)
    VALUES (?, ?, ?)
    ON CONFLICT(product_id, ingredient_id) DO UPDATE SET quantity_used = excluded.quantity_used
  `).run(req.params.id, ingredient_id, parseFloat(quantity_used));
  res.json({ success: true });
});

// Owner: delete a recipe line
router.delete('/:id/recipe/:ingredient_id', requireOwner, (req, res) => {
  db.prepare('DELETE FROM recipes WHERE product_id = ? AND ingredient_id = ?')
    .run(req.params.id, req.params.ingredient_id);
  res.json({ success: true });
});

// Owner: list categories
router.get('/categories/all', requireStaff, (req, res) => {
  res.json(db.prepare('SELECT * FROM categories ORDER BY sort_order').all());
});

module.exports = router;
