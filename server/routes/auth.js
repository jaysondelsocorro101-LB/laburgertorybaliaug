const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = db.prepare(
    'SELECT * FROM users WHERE email_or_username = ? AND is_active = 1'
  ).get(username.trim());

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.user = {
    id: user.id,
    name: user.name,
    role: user.role,
    is_active: user.is_active,
  };

  res.json({ success: true, user: { id: user.id, name: user.name, role: user.role } });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.json({ user: null });
  }
  res.json({ user: req.session.user });
});

module.exports = router;
