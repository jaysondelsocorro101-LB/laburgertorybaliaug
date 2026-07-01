const express = require('express');
const { requireOwner, requireStaff } = require('../middleware/auth');
const db = require('../db');
const router = express.Router();

router.get('/', requireStaff, (req, res) => {
  const today = db.prepare(`
    SELECT
      COALESCE(SUM(total_amount), 0) as revenue,
      COUNT(*) as order_count,
      COALESCE(AVG(total_amount), 0) as avg_order_value
    FROM orders
    WHERE date(created_at) = date('now') AND status != 'cancelled'
  `).get();

  const topProducts = db.prepare(`
    SELECT p.name, SUM(oi.quantity) as total_sold, SUM(oi.subtotal) as revenue
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at >= datetime('now', '-7 days') AND o.status != 'cancelled'
    GROUP BY p.id ORDER BY total_sold DESC LIMIT 8
  `).all();

  const trend = db.prepare(`
    SELECT date(created_at) as day,
           COALESCE(SUM(total_amount), 0) as revenue,
           COUNT(*) as orders
    FROM orders
    WHERE created_at >= datetime('now', '-7 days') AND status != 'cancelled'
    GROUP BY date(created_at) ORDER BY day ASC
  `).all();

  const pendingGcash = db.prepare(`
    SELECT COUNT(*) as count FROM orders
    WHERE payment_method = 'gcash' AND payment_status = 'pending_verification'
    AND status NOT IN ('cancelled','completed')
  `).get();

  const activeOrders = db.prepare(`
    SELECT COUNT(*) as count FROM orders
    WHERE status IN ('received','preparing','ready')
  `).get();

  const lowStock = db.prepare(`
    SELECT COUNT(*) as count FROM ingredients WHERE current_stock <= reorder_point
  `).get();

  res.json({ today, topProducts, trend, pendingGcash: pendingGcash.count, activeOrders: activeOrders.count, lowStock: lowStock.count });
});

module.exports = router;
