const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const { toPublicUser } = require('../utils/mappers');

// Verify JWT token
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { data: userRow, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.id)
      .maybeSingle();

    if (error) throw error;
    const user = userRow ? toPublicUser(userRow) : null;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Token is invalid. User not found.',
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated.',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token is invalid or expired.',
    });
  }
};

// Require Super Admin
const requireSuperAdmin = (req, res, next) => {
  if (!req.user || !req.user.isSuperAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Super Admin privileges required.',
    });
  }
  next();
};

// Require specific role(s) - case-insensitive string matching
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    // Super admin always has access
    if (req.user.isSuperAdmin) return next();

    // Normalize roles to lowercase for comparison
    const normalizedRoles = roles.map((r) => r.toLowerCase().trim());
    const userRole = req.user.role.toLowerCase().trim();

    if (!normalizedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role(s): ${roles.join(', ')}. Your role: ${req.user.role}`,
        requiredRoles: roles,
        yourRole: req.user.role,
      });
    }

    next();
  };
};

// Require any authenticated user (active)
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
    });
  }
  next();
};


// Require a specific permission — checks the role's permissions array in Supabase
const requirePermission = (permission) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    // Super admin always passes
    if (req.user.isSuperAdmin) return next();

    const supabase = require('../config/supabase');
    try {
      const { data: roleData } = await supabase
        .from('roles')
        .select('permissions')
        .eq('name', req.user.role)
        .maybeSingle();

      const perms = (roleData && Array.isArray(roleData.permissions)) ? roleData.permissions : [];
      if (!perms.includes(permission)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Missing permission: ${permission}`,
        });
      }
      next();
    } catch (e) {
      return res.status(500).json({ success: false, message: 'Server error checking permissions.' });
    }
  };
};

module.exports = { protect, requireSuperAdmin, requireRole, requireAuth, requirePermission };

