const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

// On Railway, use /app/data volume for persistence. Locally, use project root.
const DB_PATH = process.env.DB_PATH ||
  (fs.existsSync('/app/data') ? '/app/data/laburgertory.db' : path.join(__dirname, '..', 'laburgertory.db'));
const UPLOADS_DIR = fs.existsSync('/app/data')
  ? '/app/data/uploads'
  : path.join(__dirname, '..', 'public', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER REFERENCES categories(id),
    name TEXT NOT NULL,
    description TEXT,
    price REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    image_url TEXT
  );

  CREATE TABLE IF NOT EXISTS ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'pc',
    cost_per_unit REAL DEFAULT 0,
    current_stock REAL DEFAULT 0,
    reorder_point REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity_used REAL NOT NULL DEFAULT 0,
    UNIQUE(product_id, ingredient_id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email_or_username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff' CHECK(role IN ('owner','staff')),
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS stock_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient_id INTEGER REFERENCES ingredients(id),
    change_type TEXT NOT NULL CHECK(change_type IN ('stock_in','stock_out','waste','adjustment')),
    quantity REAL NOT NULL,
    note TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customer_name TEXT NOT NULL,
    customer_contact TEXT,
    order_type TEXT NOT NULL DEFAULT 'pickup' CHECK(order_type IN ('pickup','delivery')),
    status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','preparing','ready','completed','cancelled')),
    total_amount REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    synced_at TEXT,
    payment_method TEXT NOT NULL DEFAULT 'cash' CHECK(payment_method IN ('cash','gcash')),
    payment_status TEXT DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid','pending_verification','verified')),
    gcash_reference TEXT,
    payment_proof_url TEXT,
    verified_by INTEGER REFERENCES users(id),
    verified_at TEXT,
    notes TEXT,
    delivery_address TEXT
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL,
    subtotal REAL NOT NULL,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS order_status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    changed_by INTEGER REFERENCES users(id),
    changed_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT
  );
`);

// Migration: add order_number column if missing
const orderCols = db.prepare('PRAGMA table_info(orders)').all();
if (!orderCols.some(c => c.name === 'order_number')) {
  db.exec('ALTER TABLE orders ADD COLUMN order_number INTEGER');
}

// Migration: add sort_order to products if missing
const productCols = db.prepare('PRAGMA table_info(products)').all();
if (!productCols.some(c => c.name === 'sort_order')) {
  db.exec('ALTER TABLE products ADD COLUMN sort_order INTEGER DEFAULT 0');
  db.exec('UPDATE products SET sort_order = id');
}

// node:sqlite uses a slightly different API than better-sqlite3
// Wrap it to match the better-sqlite3 interface used in routes

const _prepare = db.prepare.bind(db);

// node:sqlite's prepare returns a statement — wrap get/all/run to match better-sqlite3 API
function prepare(sql) {
  const stmt = _prepare(sql);
  return {
    get(...args) { return stmt.get(...args); },
    all(...args) { return stmt.all(...args); },
    run(...args) {
      const r = stmt.run(...args);
      return { lastInsertRowid: r.lastInsertRowid, changes: r.changes };
    },
    iterate(...args) { return stmt.iterate(...args); },
  };
}

function exec(sql) { return db.exec(sql); }

// Transaction helper matching better-sqlite3's db.transaction(fn)() pattern
function transaction(fn) {
  return function(...args) {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
}

module.exports = { prepare, exec, transaction };
