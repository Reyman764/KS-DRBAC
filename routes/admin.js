const express = require('express');
const router = express.Router();
const { protect, requireSuperAdmin } = require('../middleware/auth');
const {
  getAllUsers,
  assignRole,
  toggleUserStatus,
  deleteUser,
  getAllRoles,
  createRole,
  updateRole,
  deleteRole,
  getStats,
} = require('../controllers/adminController');

// All admin routes require authentication + super admin
router.use(protect, requireSuperAdmin);

// Stats
router.get('/stats', getStats);

// User management
router.get('/users', getAllUsers);
router.put('/users/:id/role', assignRole);
router.put('/users/:id/toggle-status', toggleUserStatus);
router.delete('/users/:id', deleteUser);

// Role management
router.get('/roles', getAllRoles);
router.post('/roles', createRole);
router.put('/roles/:id', updateRole);
router.delete('/roles/:id', deleteRole);

module.exports = router;
