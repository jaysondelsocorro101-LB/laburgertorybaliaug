function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!req.session.user.is_active) {
    req.session.destroy(() => {});
    return res.status(403).json({ error: 'Account deactivated' });
  }
  next();
}

function requireOwner(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.session.user.role !== 'owner') {
    return res.status(403).json({ error: 'Owner access required' });
  }
  next();
}

function requireStaff(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!['owner', 'staff'].includes(req.session.user.role)) {
    return res.status(403).json({ error: 'Staff access required' });
  }
  next();
}

module.exports = { requireAuth, requireOwner, requireStaff };
