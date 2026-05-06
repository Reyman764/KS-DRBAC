const supabase = require('../config/supabase');
const { toPublicUser } = require('../utils/mappers');

const escapeLike = (value) => value.replace(/[%_]/g, '');

const withAssignedBy = async (userRows) => {
  const assignedIds = [...new Set(userRows.map((u) => u.assigned_by).filter(Boolean))];
  let assignedMap = {};

  if (assignedIds.length) {
    const { data: assignedUsers } = await supabase
      .from('users')
      .select('id,name,email')
      .in('id', assignedIds);

    assignedMap = (assignedUsers || []).reduce((acc, user) => {
      acc[user.id] = { _id: user.id, name: user.name, email: user.email };
      return acc;
    }, {});
  }

  return userRows.map((row) => toPublicUser({ ...row, assignedBy: assignedMap[row.assigned_by] || null }));
};

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Super Admin
const getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const search = req.query.search || '';
    const safeSearch = escapeLike(search.trim());
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
    const total = count || 0;

    res.json({
      success: true,
      data: users,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// @desc    Assign role to user (manual string input)
// @route   PUT /api/admin/users/:id/role
// @access  Super Admin
const assignRole = async (req, res) => {
  try {
    const { role } = req.body;
    const userId = req.params.id;

    if (!role || !role.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Role name is required.',
      });
    }

    const cleanRole = role.trim().toLowerCase();

    if (cleanRole === 'superadmin' || cleanRole === 'super admin' || cleanRole === 'super_admin') {
      return res.status(400).json({
        success: false,
        message: 'Cannot assign Super Admin role through this interface.',
      });
    }

    const { data: user, error: findUserError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (findUserError) throw findUserError;
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (user.is_super_admin) {
      return res.status(400).json({
        success: false,
        message: 'Cannot change the role of a Super Admin.',
      });
    }

    await supabase
      .from('users')
      .update({
        role: cleanRole,
        assigned_by: req.user._id,
        role_assigned_at: new Date().toISOString(),
      })
      .eq('id', userId);

    await supabase.from('roles').upsert(
      {
        name: cleanRole,
        display_name: role.trim(),
        created_by: req.user._id,
      },
      { onConflict: 'name' }
    );

    const { data: updatedUser } = await supabase.from('users').select('*').eq('id', userId).single();

    res.json({
      success: true,
      message: `Role "${role.trim()}" assigned to ${updatedUser.name} successfully.`,
      user: toPublicUser(updatedUser),
    });
  } catch (error) {
    console.error('Assign role error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// @desc    Toggle user active status
// @route   PUT /api/admin/users/:id/toggle-status
// @access  Super Admin
const toggleUserStatus = async (req, res) => {
  try {
    const { data: user, error: findUserError } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (findUserError) throw findUserError;
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (user.is_super_admin) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate Super Admin account.',
      });
    }

    if (user.id === req.user._id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate your own account.',
      });
    }

    const nextStatus = !user.is_active;
    await supabase.from('users').update({ is_active: nextStatus }).eq('id', user.id);

    res.json({
      success: true,
      message: `User ${nextStatus ? 'activated' : 'deactivated'} successfully.`,
      user: { _id: user.id, name: user.name, isActive: nextStatus },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Super Admin
const deleteUser = async (req, res) => {
  try {
    const { data: user, error: findUserError } = await supabase
      .from('users')
      .select('id,name,role,is_super_admin')
      .eq('id', req.params.id)
      .maybeSingle();
    if (findUserError) throw findUserError;
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (user.is_super_admin) {
      return res.status(400).json({ success: false, message: 'Cannot delete Super Admin.' });
    }

    if (user.id === req.user._id) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account.' });
    }

    await supabase.from('users').delete().eq('id', req.params.id);

    res.json({ success: true, message: 'User deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// @desc    Get all roles
// @route   GET /api/admin/roles
// @access  Super Admin
const getAllRoles = async (req, res) => {
  try {
    const { data: roles, error } = await supabase
      .from('roles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const roleNames = (roles || []).map((r) => r.name);
    const roleUserCounts = {};
    if (roleNames.length) {
      const { data: usersByRole } = await supabase.from('users').select('role').in('role', roleNames);
      (usersByRole || []).forEach((u) => {
        roleUserCounts[u.role] = (roleUserCounts[u.role] || 0) + 1;
      });
    }

    const rolesWithCounts = (roles || []).map((role) => ({
      _id: role.id,
      name: role.name,
      displayName: role.display_name,
      description: role.description,
      permissions: role.permissions || [],
      isSystem: role.is_system,
      userCount: roleUserCounts[role.name] || 0,
      createdAt: role.created_at,
      updatedAt: role.updated_at,
    }));

    res.json({ success: true, data: rolesWithCounts });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// @desc    Create a role (optional pre-creation)
// @route   POST /api/admin/roles
// @access  Super Admin
const createRole = async (req, res) => {
  try {
    const { name, description, permissions } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Role name is required.' });
    }

    const cleanName = name.trim().toLowerCase();
    const { data: existing } = await supabase
      .from('roles')
      .select('id')
      .eq('name', cleanName)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ success: false, message: 'A role with this name already exists.' });
    }

    const { data: role, error } = await supabase
      .from('roles')
      .insert({
        name: cleanName,
        display_name: name.trim(),
        description: description || '',
        permissions: permissions || [],
        created_by: req.user._id,
      })
      .select('*')
      .single();
    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Role created.',
      data: {
        _id: role.id,
        name: role.name,
        displayName: role.display_name,
        description: role.description,
        permissions: role.permissions || [],
        isSystem: role.is_system,
        createdAt: role.created_at,
        updatedAt: role.updated_at,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// @desc    Delete a role
// @route   DELETE /api/admin/roles/:id
// @access  Super Admin
const deleteRole = async (req, res) => {
  try {
    const { data: role, error: findRoleError } = await supabase
      .from('roles')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (findRoleError) throw findRoleError;
    if (!role) return res.status(404).json({ success: false, message: 'Role not found.' });

    if (role.is_system) {
      return res.status(400).json({ success: false, message: 'Cannot delete a system role.' });
    }

    // Reset users with this role to 'user'
    await supabase.from('users').update({ role: 'user' }).eq('role', role.name);
    await supabase.from('roles').delete().eq('id', req.params.id);

    res.json({ success: true, message: `Role "${role.display_name}" deleted. Affected users reset to "user".` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// @desc    Get dashboard stats
// @route   GET /api/admin/stats
// @access  Super Admin
const getStats = async (req, res) => {
  try {
    const [{ count: totalUsers = 0 }, { count: activeUsers = 0 }, { count: totalRoles = 0 }] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('is_super_admin', false),
      supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('is_super_admin', false)
        .eq('is_active', true),
      supabase.from('roles').select('id', { count: 'exact', head: true }),
    ]);

    const { data: recentUsersRows } = await supabase
      .from('users')
      .select('id,name,email,role,created_at,is_active,is_super_admin')
      .eq('is_super_admin', false)
      .order('created_at', { ascending: false })
      .limit(5);

    const { data: roleRows } = await supabase
      .from('users')
      .select('role')
      .eq('is_super_admin', false);

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
        recentUsers: (recentUsersRows || []).map((u) => ({
          _id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          createdAt: u.created_at,
          isActive: u.is_active,
        })),
        roleDistribution,
      },
    });
  } catch (error) {
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
  deleteRole,
  getStats,
};
