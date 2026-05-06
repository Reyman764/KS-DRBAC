const toPublicUser = (row) => ({
  _id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  isSuperAdmin: row.is_super_admin,
  isActive: row.is_active,
  lastLogin: row.last_login,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  roleAssignedAt: row.role_assigned_at,
  assignedBy: row.assignedBy || null,
});

module.exports = { toPublicUser };
