const express = require('express');
const db = require('../db');
const router = express.Router();

// Public: full menu grouped by category
router.get('/', (req, res) => {
  const categories = db.prepare(
    'SELECT * FROM categories ORDER BY sort_order ASC'
  ).all();

  const getProducts = db.prepare(
    'SELECT * FROM products WHERE category_id = ? AND is_active = 1 ORDER BY name ASC'
  );

  const menu = categories.map(cat => ({
    ...cat,
    products: getProducts.all(cat.id),
  }));

  res.json(menu);
});

module.exports = router;
