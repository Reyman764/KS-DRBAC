'use strict';

const jwt      = require('jsonwebtoken');
const supabase  = require('../config/supabase');
const { toPublicUser } = require('../utils/mappers');

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { data: userRow, error } = await supabase
      .from('users').select('*').eq('id', decoded.id).maybeSingle();
    if (error) throw error;
    const user = userRow ? toPublicUser(userRow) : null;
    if (!user) return res.status(401).json({ success: false, message: 'Token is invalid. User not found.' });
    if (!user.isActive) return res.status(401).json({ success: false, message: 'Your account has been deactivated.' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Token is invalid or expired.' });
  }
};

const requireSuperAdmin = (req, res, next) => {
  if (!req.user || !req.user.isSuperAdmin) {
    return res.status(403).json({ success: false, message: 'Access denied. Super Admin privileges required.' });
  }
  next();
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required.' });
  if (req.user.isSuperAdmin) return next();
  const normalised = roles.map(r => r.toLowerCase().trim());
  if (!normalised.includes(req.user.role.toLowerCase().trim())) {
    return res.status(403).json({
      success: false,
      message: `Access denied. Required role(s): ${roles.join(', ')}. Your role: ${req.user.role}`,
      requiredRoles: roles, yourRole: req.user.role,
    });
  }
  next();
};

// Bug fix: removed inner re-require that shadowed the module-level supabase import
const requirePermission = (permission) => async (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required.' });
  if (req.user.isSuperAdmin) return next();
  try {
    const { data: roleData } = await supabase
      .from('roles').select('permissions').eq('name', req.user.role).maybeSingle();
    const perms = Array.isArray(roleData?.permissions) ? roleData.permissions : [];
    if (!perms.includes(permission)) {
      return res.status(403).json({ success: false, message: `Access denied. Missing permission: ${permission}` });
    }
    next();
  } catch {
    return res.status(500).json({ success: false, message: 'Server error checking permissions.' });
  }
};

const requireAuth = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required.' });
  next();
};

module.exports = { protect, requireSuperAdmin, requireRole, requireAuth, requirePermission };
