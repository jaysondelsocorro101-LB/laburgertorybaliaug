const express = require('express');
const db = require('../db');
const { requireStaff, requireOwner } = require('../middleware/auth');
const router = express.Router();

// Staff/owner: list all ingredients
router.get('/', requireStaff, (req, res) => {
  const ingredients = db.prepare('SELECT * FROM ingredients ORDER BY name ASC').all();
  res.json(ingredients);
});

// Staff/owner: low stock list
router.get('/low-stock', requireStaff, (req, res) => {
  const low = db.prepare(
    'SELECT * FROM ingredients WHERE current_stock <= reorder_point ORDER BY name ASC'
  ).all();
  res.json(low);
});

// Owner: create ingredient
router.post('/', requireOwner, (req, res) => {
  const { name, unit, cost_per_unit, current_stock, reorder_point } = req.body;
  if (!name || !unit) return res.status(400).json({ error: 'Name and unit required' });

  const result = db.prepare(`
    INSERT INTO ingredients (name, unit, cost_per_unit, current_stock, reorder_point)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, unit, cost_per_unit || 0, current_stock || 0, reorder_point || 0);

  res.json({ success: true, id: result.lastInsertRowid });
});

// Owner: update ingredient
router.patch('/:id', requireOwner, (req, res) => {
  const { name, unit, cost_per_unit, current_stock, reorder_point } = req.body;
  const existing = db.prepare('SELECT id FROM ingredients WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Ingredient not found' });

  db.prepare(`
    UPDATE ingredients SET
      name = COALESCE(?, name),
      unit = COALESCE(?, unit),
      cost_per_unit = COALESCE(?, cost_per_unit),
      current_stock = COALESCE(?, current_stock),
      reorder_point = COALESCE(?, reorder_point)
    WHERE id = ?
  `).run(name, unit, cost_per_unit, current_stock, reorder_point, req.params.id);

  res.json({ success: true });
});

// Staff/owner: log stock movement
router.post('/stock-log', requireStaff, (req, res) => {
  const { ingredient_id, change_type, quantity, note } = req.body;
  const valid_types = ['stock_in', 'stock_out', 'waste', 'adjustment'];
  if (!ingredient_id || !change_type || !quantity) {
    return res.status(400).json({ error: 'ingredient_id, change_type, quantity required' });
  }
  if (!valid_types.includes(change_type)) {
    return res.status(400).json({ error: 'Invalid change_type' });
  }

  const ing = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(ingredient_id);
  if (!ing) return res.status(404).json({ error: 'Ingredient not found' });

  const qty = parseFloat(quantity);
  let delta = qty;
  if (['stock_out', 'waste'].includes(change_type)) delta = -qty;

  db.prepare(`
    INSERT INTO stock_log (ingredient_id, change_type, quantity, note, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(ingredient_id, change_type, qty, note || '', req.session.user.id);

  db.prepare('UPDATE ingredients SET current_stock = current_stock + ? WHERE id = ?')
    .run(delta, ingredient_id);

  res.json({ success: true, new_stock: ing.current_stock + delta });
});

// Staff/owner: get stock log
router.get('/stock-log', requireStaff, (req, res) => {
  const { ingredient_id, limit = 100 } = req.query;
  let sql = `
    SELECT sl.*, i.name as ingredient_name, u.name as user_name
    FROM stock_log sl
    JOIN ingredients i ON i.id = sl.ingredient_id
    LEFT JOIN users u ON u.id = sl.created_by
    WHERE 1=1
  `;
  const params = [];
  if (ingredient_id) { sql += ' AND sl.ingredient_id = ?'; params.push(ingredient_id); }
  sql += ' ORDER BY sl.created_at DESC LIMIT ?';
  params.push(parseInt(limit));

  res.json(db.prepare(sql).all(...params));
});

module.exports = router;
