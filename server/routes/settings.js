const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { requireOwner } = require('../middleware/auth');
const router = express.Router();

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', 'public', 'uploads'),
  filename: (req, file, cb) => {
    cb(null, `gcash_qr_${Date.now()}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const getSetting = (key) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
};

const setSetting = (key, value) => {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
};

// Public: GCash payment info
router.get('/gcash', (req, res) => {
  res.json({
    gcash_number: getSetting('gcash_number'),
    gcash_name: getSetting('gcash_name'),
    gcash_qr_image_url: getSetting('gcash_qr_image_url'),
  });
});

// Owner: update GCash settings
router.patch('/gcash', requireOwner, upload.single('qr_image'), (req, res) => {
  const { gcash_number, gcash_name } = req.body;
  if (gcash_number) setSetting('gcash_number', gcash_number);
  if (gcash_name) setSetting('gcash_name', gcash_name);
  if (req.file) setSetting('gcash_qr_image_url', `/uploads/${req.file.filename}`);
  res.json({ success: true });
});

// Owner: get all settings
router.get('/all', requireOwner, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) settings[row.key] = row.value;
  res.json(settings);
});

// Owner: update generic setting
router.patch('/update', requireOwner, (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'key required' });
  setSetting(key, value);
  res.json({ success: true });
});

module.exports = router;
