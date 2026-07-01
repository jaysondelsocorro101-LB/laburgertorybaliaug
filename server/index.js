try { require('dotenv').config(); } catch {}
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const path = require('path');
const db = require('./db');

// Auto-seed on first run (no owner = fresh database)
const ownerExists = db.prepare("SELECT id FROM users WHERE role='owner' LIMIT 1").get();
if (!ownerExists) {
  console.log('🌱 Fresh database detected — running seed...');
  require('./seed');
  console.log('✅ Seed complete');
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(session({
  store: new FileStore({ path: path.join(__dirname, '..', 'sessions'), ttl: 7 * 24 * 3600, reapInterval: 3600 }),
  secret: process.env.SESSION_SECRET || 'laburgertory-secret-dev',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/menu', require('./routes/menu'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/ingredients', require('./routes/ingredients'));
app.use('/api/products', require('./routes/products'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/users', require('./routes/users'));
app.use('/api/dashboard', require('./routes/dashboard'));

// SPA fallback
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── GCash auto-cancel: expire unverified orders after 15 min ──
function cancelExpiredGcashOrders() {
  const cancelled = db.transaction(() => {
    const expired = db.prepare(`
      SELECT id FROM orders
      WHERE payment_method = 'gcash'
        AND payment_status = 'pending_verification'
        AND status = 'received'
        AND created_at < datetime('now', '-15 minutes')
    `).all();

    for (const o of expired) {
      db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(o.id);
      db.prepare("INSERT INTO order_status_history (order_id, status) VALUES (?, 'cancelled')").run(o.id);
    }
    return expired.length;
  });
  const count = cancelled();
  if (count > 0) console.log(`[GCash] Auto-cancelled ${count} unverified order(s)`);
}

setInterval(cancelExpiredGcashOrders, 5 * 60 * 1000);
cancelExpiredGcashOrders(); // run once on startup

app.listen(PORT, () => {
  console.log(`🍔 LaBurgertory running on http://localhost:${PORT}`);
  console.log(`   Staff login: http://localhost:${PORT}/login.html`);
});
