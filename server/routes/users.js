const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireOwner, requireStaff } = require('../middleware/auth');
const router = express.Router();

// Owner: list all users
router.get('/', requireOwner, (req, res) => {
  const users = db.prepare(
    'SELECT id, name, email_or_username, role, is_active, created_at FROM users ORDER BY created_at DESC'
  ).all();
  res.json(users);
});

// Owner: create user
router.post('/', requireOwner, (req, res) => {
  const { name, email_or_username, password, role } = req.body;
  if (!name || !email_or_username || !password) {
    return res.status(400).json({ error: 'name, email_or_username, and password required' });
  }
  if (!['owner', 'staff'].includes(role)) {
    return res.status(400).json({ error: 'role must be owner or staff' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email_or_username = ?').get(email_or_username);
  if (existing) return res.status(409).json({ error: 'Username already exists' });

  const password_hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (name, email_or_username, password_hash, role)
    VALUES (?, ?, ?, ?)
  `).run(name, email_or_username, password_hash, role || 'staff');

  res.json({ success: true, id: result.lastInsertRowid });
});

// Owner: update user (deactivate, change role, reset password)
router.patch('/:id', requireOwner, (req, res) => {
  const { name, role, is_active, password } = req.body;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Prevent owner from deactivating their own account
  if (parseInt(req.params.id) === req.session.user.id && is_active === 0) {
    return res.status(400).json({ error: 'Cannot deactivate your own account' });
  }

  if (password) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(bcrypt.hashSync(password, 10), req.params.id);
  }

  db.prepare(`
    UPDATE users SET
      name = COALESCE(?, name),
      role = COALESCE(?, role),
      is_active = COALESCE(?, is_active)
    WHERE id = ?
  `).run(name, role, is_active != null ? parseInt(is_active) : null, req.params.id);

  res.json({ success: true });
});

// Any logged-in user: change own password
router.patch('/change-password', requireStaff, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'current_password and new_password required' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  // Look up by username in case session ID differs from DB (e.g. fresh Railway DB)
  const user = db.prepare('SELECT * FROM users WHERE id = ? OR email_or_username = ?')
    .get(req.session.user.id, req.session.user.username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(bcrypt.hashSync(new_password, 10), user.id);
  res.json({ success: true });
});

module.exports = router;
