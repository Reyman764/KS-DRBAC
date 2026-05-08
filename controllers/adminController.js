'use strict';

const supabase = require('../config/supabase');
const { toPublicUser } = require('../utils/mappers');

// Bug fix: original escapeLike removed % and _ instead of escaping them
const escapeLike = (value) =>
  String(value || '').replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');

/* ─── helper: enrich users with assignedBy details ─── */
const withAssignedBy = async (userRows) => {
  const assignedIds = [...new Set(userRows.map((u) => u.assigned_by).filter(Boolean))];
  let assignedMap = {};
  if (assignedIds.length) {
    const { data: assignedUsers } = await supabase
      .from('users').select('id,name,email').in('id', assignedIds);
    assignedMap = (assignedUsers || []).reduce((acc, u) => {
      acc[u.id] = { _id: u.id, name: u.name, email: u.email };
      return acc;
    }, {});
  }
  return userRows.map((row) =>
    toPublicUser({ ...row, assignedBy: assignedMap[row.assigned_by] || null })
  );
};

// @desc  Get all users (paginated + searchable)
// @route GET /api/admin/users
const getAllUsers = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;
    const search = (req.query.search || '').trim();
    const safeSearch = escapeLike(search);

    let query = supabase
      .from('users')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (safeSearch) {
      query = query.or(`name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%,role.ilike.%${safeSearch}%`);
    }

    const { data: userRows, error, count } = await query;
    if (error) throw error;
    const users = await withAssignedBy(userRows || []);

    res.json({
      success: true,
      data: users,
      pagination: { total: count || 0, page, limit, pages: Math.ceil((count || 0) / limit) },
    });
  } catch (err) {
    console.error('getAllUsers error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// @desc  Assign role to user (from dropdown of existing roles)
// @route PUT /api/admin/users/:id/role
const assignRole = async (req, res) => {
  try {
    const { role } = req.body;
    const userId   = req.params.id;

    if (!role || !role.trim()) {
      return res.status(400).json({ success: false, message: 'Role name is required.' });
    }

    const cleanRole = role.trim().toLowerCase();
    if (['superadmin', 'super admin', 'super_admin'].includes(cleanRole)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot assign Super Admin role through this interface.',
      });
    }

    // Verify target user exists
    const { data: user, error: findErr } = await supabase
      .from('users').select('*').eq('id', userId).maybeSingle();
    if (findErr) throw findErr;
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (user.is_super_admin) {
      return res.status(400).json({ success: false, message: 'Cannot change the role of a Super Admin.' });
    }

    // Verify the role actually exists in the roles table
    const { data: roleRecord } = await supabase
      .from('roles').select('id,name,display_name').eq('name', cleanRole).maybeSingle();
    if (!roleRecord) {
      return res.status(404).json({ success: false, message: `Role "${role.trim()}" does not exist. Create it first.` });
    }

    await supabase.from('users').update({
      role: cleanRole,
      assigned_by: req.user._id,
      role_assigned_at: new Date().toISOString(),
    }).eq('id', userId);

    const { data: updated } = await supabase.from('users').select('*').eq('id', userId).single();
    res.json({
      success: true,
      message: `Role "${roleRecord.display_name || cleanRole}" assigned to ${updated.name} successfully.`,
      user: toPublicUser(updated),
    });
  } catch (err) {
    console.error('assignRole error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// @desc  Toggle user active/inactive
// @route PUT /api/admin/users/:id/toggle-status
const toggleUserStatus = async (req, res) => {
  try {
    const { data: user, error: findErr } = await supabase
      .from('users').select('*').eq('id', req.params.id).maybeSingle();
    if (findErr) throw findErr;
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (user.is_super_admin) {
      return res.status(400).json({ success: false, message: 'Cannot deactivate Super Admin account.' });
    }
    if (user.id === req.user._id) {
      return res.status(400).json({ success: false, message: 'Cannot deactivate your own account.' });
    }
    const nextStatus = !user.is_active;
    await supabase.from('users').update({ is_active: nextStatus }).eq('id', user.id);
    res.json({
      success: true,
      message: `User ${nextStatus ? 'activated' : 'deactivated'} successfully.`,
      user: { _id: user.id, name: user.name, isActive: nextStatus },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// @desc  Delete user
// @route DELETE /api/admin/users/:id
const deleteUser = async (req, res) => {
  try {
    const { data: user, error: findErr } = await supabase
      .from('users').select('id,name,is_super_admin').eq('id', req.params.id).maybeSingle();
    if (findErr) throw findErr;
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (user.is_super_admin) return res.status(400).json({ success: false, message: 'Cannot delete Super Admin.' });
    if (user.id === req.user._id) return res.status(400).json({ success: false, message: 'Cannot delete your own account.' });
    await supabase.from('users').delete().eq('id', req.params.id);
    res.json({ success: true, message: 'User deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// @desc  Get all roles (with user counts)
// @route GET /api/admin/roles
const getAllRoles = async (req, res) => {
  try {
    const { data: roles, error } = await supabase
      .from('roles').select('*').order('created_at', { ascending: false });
    if (error) throw error;

    const roleNames = (roles || []).map((r) => r.name);
    let roleUserCounts = {};
    if (roleNames.length) {
      const { data: usersByRole } = await supabase.from('users').select('role').in('role', roleNames);
      (usersByRole || []).forEach((u) => {
        roleUserCounts[u.role] = (roleUserCounts[u.role] || 0) + 1;
      });
    }

    const formatted = (roles || []).map((r) => ({
      _id:         r.id,
      name:        r.name,
      displayName: r.display_name,
      description: r.description,
      permissions: r.permissions || [],
      isSystem:    r.is_system,
      userCount:   roleUserCounts[r.name] || 0,
      createdAt:   r.created_at,
      updatedAt:   r.updated_at,
    }));

    res.json({ success: true, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// @desc  Create a new role (with optional initial permissions)
// @route POST /api/admin/roles
const createRole = async (req, res) => {
  try {
    const { name, description, permissions } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Role name is required.' });
    }

    const cleanName = name.trim().toLowerCase();
    if (['superadmin', 'super_admin', 'super admin'].includes(cleanName)) {
      return res.status(400).json({ success: false, message: 'Reserved role name.' });
    }

    const { data: existing } = await supabase.from('roles').select('id').eq('name', cleanName).maybeSingle();
    if (existing) return res.status(409).json({ success: false, message: 'A role with this name already exists.' });

    // Validate permissions list (only known keys allowed)
    const safePerms = Array.isArray(permissions)
      ? permissions.filter((p) => typeof p === 'string' && p.trim())
      : [];

    const { data: role, error } = await supabase
      .from('roles')
      .insert({
        name:        cleanName,
        display_name: name.trim(),
        description: description || '',
        permissions: safePerms,
        created_by:  req.user._id,
      })
      .select('*')
      .single();
    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Role created.',
      data: {
        _id:         role.id,
        name:        role.name,
        displayName: role.display_name,
        description: role.description,
        permissions: role.permissions || [],
        isSystem:    role.is_system,
        createdAt:   role.created_at,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// @desc  Update role name, description, and/or permissions
// @route PUT /api/admin/roles/:id
const updateRole = async (req, res) => {
  try {
    const { data: role, error: findErr } = await supabase
      .from('roles').select('*').eq('id', req.params.id).maybeSingle();
    if (findErr) throw findErr;
    if (!role) return res.status(404).json({ success: false, message: 'Role not found.' });
    if (role.is_system) return res.status(400).json({ success: false, message: 'Cannot edit a system role.' });

    const { name, description, permissions } = req.body;
    const updates = {};
    if (name && name.trim())          updates.display_name = name.trim();
    if (description !== undefined)    updates.description  = description;
    if (Array.isArray(permissions))   updates.permissions  = permissions.filter((p) => typeof p === 'string');

    const { data: updated, error: updateErr } = await supabase
      .from('roles').update(updates).eq('id', req.params.id).select('*').single();
    if (updateErr) throw updateErr;

    res.json({
      success: true,
      message: 'Role updated.',
      data: {
        _id:         updated.id,
        name:        updated.name,
        displayName: updated.display_name,
        description: updated.description,
        permissions: updated.permissions || [],
        isSystem:    updated.is_system,
        updatedAt:   updated.updated_at,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// @desc  Delete a role
// @route DELETE /api/admin/roles/:id
const deleteRole = async (req, res) => {
  try {
    const { data: role, error: findErr } = await supabase
      .from('roles').select('*').eq('id', req.params.id).maybeSingle();
    if (findErr) throw findErr;
    if (!role) return res.status(404).json({ success: false, message: 'Role not found.' });
    if (role.is_system) return res.status(400).json({ success: false, message: 'Cannot delete a system role.' });

    // Reset affected users to 'user'
    await supabase.from('users').update({ role: 'user' }).eq('role', role.name);
    await supabase.from('roles').delete().eq('id', req.params.id);

    res.json({ success: true, message: `Role "${role.display_name}" deleted. Affected users reset to "user".` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// @desc  Update permissions array for a role
// @route PUT /api/admin/roles/:id/permissions  (Super Admin only)
const updateRolePermissions = async (req, res) => {
  try {
    const { permissions } = req.body;
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ success: false, message: 'permissions must be an array.' });
    }

    const { data: role, error: findErr } = await supabase
      .from('roles').select('*').eq('id', req.params.id).maybeSingle();
    if (findErr) throw findErr;
    if (!role) return res.status(404).json({ success: false, message: 'Role not found.' });
    if (role.is_system) return res.status(400).json({ success: false, message: 'Cannot modify system role permissions.' });

    const safePerms = permissions.filter((p) => typeof p === 'string' && p.trim());
    const { error: updateErr } = await supabase
      .from('roles').update({ permissions: safePerms }).eq('id', req.params.id);
    if (updateErr) throw updateErr;

    res.json({ success: true, message: 'Permissions saved.', data: { permissions: safePerms } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// @desc  Dashboard statistics
// @route GET /api/admin/stats
const getStats = async (req, res) => {
  try {
    const [
      { count: totalUsers  = 0 },
      { count: activeUsers = 0 },
      { count: totalRoles  = 0 },
    ] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('is_super_admin', false),
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('is_super_admin', false).eq('is_active', true),
      supabase.from('roles').select('id', { count: 'exact', head: true }),
    ]);

    const { data: recentRows } = await supabase
      .from('users')
      .select('id,name,email,role,created_at,is_active')
      .eq('is_super_admin', false)
      .order('created_at', { ascending: false })
      .limit(5);

    const { data: roleRows } = await supabase
      .from('users').select('role').eq('is_super_admin', false);

    const roleCountMap = {};
    (roleRows || []).forEach((row) => {
      roleCountMap[row.role] = (roleCountMap[row.role] || 0) + 1;
    });
    const roleDistribution = Object.entries(roleCountMap)
      .map(([role, count]) => ({ _id: role, count }))
      .sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        inactiveUsers: totalUsers - activeUsers,
        totalRoles,
        recentUsers: (recentRows || []).map((u) => ({
          _id:       u.id,
          name:      u.name,
          email:     u.email,
          role:      u.role,
          createdAt: u.created_at,
          isActive:  u.is_active,
        })),
        roleDistribution,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
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
};
