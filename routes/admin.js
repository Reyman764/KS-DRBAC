const express = require('express');
const router = express.Router();
const { protect, requireSuperAdmin, requirePermission } = require('../middleware/auth');
const {
  getAllUsers,
  assignRole,
  toggleUserStatus,
  deleteUser,
  getAllRoles,
  createRole,
  updateRole,
  deleteRole,
  updateRolePermissions,
  getStats,
} = require('../controllers/adminController');

// All routes require authentication
router.use(protect);

// Stats — visible to anyone who can see the dashboard
router.get('/stats', getStats);

// User management — each action guarded by its own permission
router.get('/users',                   requirePermission('users:view'),          getAllUsers);
router.put('/users/:id/role',          requirePermission('users:assign_role'),   assignRole);
router.put('/users/:id/toggle-status', requirePermission('users:toggle_status'), toggleUserStatus);
router.delete('/users/:id',            requirePermission('users:delete'),        deleteUser);

// Role management
router.get('/roles',                   requirePermission('roles:view'),          getAllRoles);
router.post('/roles',                  requirePermission('roles:create'),        createRole);
router.put('/roles/:id',               requirePermission('roles:edit'),          updateRole);
router.put('/roles/:id/permissions',   requireSuperAdmin,                        updateRolePermissions);
router.delete('/roles/:id',            requirePermission('roles:delete'),        deleteRole);

module.exports = router;
