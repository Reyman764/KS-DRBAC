/* ══════════════════════════════════════════════════════
   DRBAC — app.js  |  All application logic
══════════════════════════════════════════════════════ */

let token        = localStorage.getItem('drbac_token') || '';
let currentUser  = null;
let pendingDeleteFn   = null;
let assignRoleUserId  = null;
let usersPage         = 1;
let usersTotalPages   = 1;
let searchTimer       = null;
let editRoleId        = null;

/* ────────────────────────────────────────────────────
   API HELPER
──────────────────────────────────────────────────── */
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  };
  if (body) opts.body = JSON.stringify(body);
  const r    = await fetch(path, opts);
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || 'Request failed');
  return data;
}

/* ────────────────────────────────────────────────────
   TOAST
──────────────────────────────────────────────────── */
function toast(msg, type = 'info') {
  const el   = document.createElement('div');
  el.className = `toast-item toast-${type}`;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  el.innerHTML = `<span>${icon}</span><span>${esc(msg)}</span>`;
  document.getElementById('toast').appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

/* ────────────────────────────────────────────────────
   AUTH
──────────────────────────────────────────────────── */
function switchTab(tab) {
  document.getElementById('login-form').style.display  = tab === 'login'  ? '' : 'none';
  document.getElementById('signup-form').style.display = tab === 'signup' ? '' : 'none';
  document.querySelectorAll('.tab-btn').forEach((b, i) => {
    b.classList.toggle('active', (tab === 'login' && i === 0) || (tab === 'signup' && i === 1));
  });
  clearAuthError();
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.style.display = '';
}

function clearAuthError() {
  document.getElementById('auth-error').style.display = 'none';
}

async function doLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) return showAuthError('Please fill in all fields.');
  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Signing in…';
  clearAuthError();
  try {
    const data = await api('POST', '/api/auth/login', { email, password });
    token = data.token;
    localStorage.setItem('drbac_token', token);
    const me = await api('GET', '/api/auth/me');
    currentUser = me.user;
    enterDashboard();
  } catch (e) {
    showAuthError(e.message);
  } finally {
    btn.disabled  = false;
    btn.textContent = 'Sign In';
  }
}

async function doSignup() {
  const name     = document.getElementById('signup-name').value.trim();
  const email    = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  if (!name || !email || !password) return showAuthError('Please fill in all fields.');
  const btn = document.getElementById('signup-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Creating account…';
  clearAuthError();
  try {
    const data = await api('POST', '/api/auth/signup', { name, email, password });
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('drbac_token', token);
    enterDashboard();
  } catch (e) {
    showAuthError(e.message);
  } finally {
    btn.disabled  = false;
    btn.textContent = 'Create Account';
  }
}

function logout() {
  token = '';
  currentUser = null;
  localStorage.removeItem('drbac_token');
  document.getElementById('auth-page').classList.remove('hidden');
  document.getElementById('dashboard-page').style.display = 'none';
  toast('Signed out successfully.', 'info');
}

/* ────────────────────────────────────────────────────
   DASHBOARD BOOT
──────────────────────────────────────────────────── */
function enterDashboard() {
  document.getElementById('auth-page').classList.add('hidden');
  document.getElementById('dashboard-page').style.display = 'block';

  if (!currentUser) return;

  const initials = currentUser.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('sb-avatar').textContent = initials;
  document.getElementById('sb-name').textContent   = currentUser.name;
  document.getElementById('sb-role').textContent   = currentUser.isSuperAdmin
    ? 'Super Admin'
    : (currentUser.role || 'user');

  const isSuper   = currentUser.isSuperAdmin;
  const userPerms = new Set(currentUser.permissions || []);

  const hasAnyMgmt = isSuper ||
    userPerms.has('users:view') || userPerms.has('roles:view') || userPerms.has('permissions:view');

  document.querySelector('.nav-section-label.admin-only').style.display = hasAnyMgmt ? '' : 'none';
  document.querySelectorAll('.nav-item.admin-only[data-permission]').forEach(el => {
    el.style.display = (isSuper || userPerms.has(el.dataset.permission)) ? '' : 'none';
  });

  // Build "New Role" button once we know who the user is
  const actionsEl = document.getElementById('roles-header-actions');
  if (actionsEl) {
    actionsEl.innerHTML = hasPermission('roles:create')
      ? `<button class="btn btn-blue btn-sm" onclick="openCreateRoleModal()">＋ New Role</button>`
      : '';
  }

  showView('dashboard');
}

function hasPermission(perm) {
  if (!currentUser) return false;
  if (currentUser.isSuperAdmin) return true;
  return (currentUser.permissions || []).includes(perm);
}

/* ────────────────────────────────────────────────────
   VIEW ROUTING
──────────────────────────────────────────────────── */
function showView(name) {
  const permMap  = { users: 'users:view', roles: 'roles:view', permissions: 'permissions:view' };
  const reqPerm  = permMap[name];
  if (reqPerm && !hasPermission(reqPerm)) {
    toast('Access denied. You do not have permission to view this section.', 'error');
    return;
  }
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  const navEl = document.querySelector(`.nav-item[onclick="showView('${name}')"]`);
  if (navEl) navEl.classList.add('active');

  const titles = {
    dashboard:   ['Dashboard',   'System overview'],
    users:       ['Users',       'Manage user accounts'],
    roles:       ['Roles',       'Manage access roles'],
    permissions: ['Permissions', 'Control role access'],
  };
  document.getElementById('topbar-title').textContent    = titles[name][0];
  document.getElementById('topbar-subtitle').textContent = titles[name][1];

  if (name === 'dashboard')   loadStats();
  if (name === 'users')       loadUsers();
  if (name === 'roles')       loadRoles();
  if (name === 'permissions') loadPermissions();
  closeSidebar();
}

/* ────────────────────────────────────────────────────
   STATS
──────────────────────────────────────────────────── */
async function loadStats() {
  try {
    const d = await api('GET', '/api/admin/stats');
    const s = d.data;
    document.getElementById('stat-total').textContent    = s.totalUsers;
    document.getElementById('stat-active').textContent   = s.activeUsers;
    document.getElementById('stat-inactive').textContent = s.inactiveUsers;
    document.getElementById('stat-roles').textContent    = s.totalRoles;

    const tbody = document.getElementById('recent-users-tbody');
    if (!s.recentUsers.length) {
      tbody.innerHTML = emptyRow(4, '👤', 'No users yet');
    } else {
      tbody.innerHTML = s.recentUsers.map(u => `
        <tr>
          <td>${userCell(u.name, u.email)}</td>
          <td><span class="badge badge-role">${esc(u.role || 'user')}</span></td>
          <td>${statusBadge(u.isActive)}</td>
          <td style="color:var(--text3);font-size:12px;font-family:var(--mono)">${fmtDate(u.createdAt)}</td>
        </tr>`).join('');
    }

    const dist = document.getElementById('role-dist');
    if (!s.roleDistribution.length) {
      dist.innerHTML = `<div class="empty-state"><div class="empty-icon">🔑</div><div class="empty-title">No roles assigned</div></div>`;
    } else {
      const max = Math.max(...s.roleDistribution.map(r => r.count));
      dist.innerHTML = s.roleDistribution.map(r => `
        <div class="dist-row">
          <div class="dist-label">${esc(r._id)}</div>
          <div class="dist-bar-bg"><div class="dist-bar" style="width:${(r.count / max * 100).toFixed(1)}%"></div></div>
          <div class="dist-count">${r.count}</div>
        </div>`).join('');
    }
  } catch (e) {
    toast('Failed to load stats: ' + e.message, 'error');
  }
}

/* ────────────────────────────────────────────────────
   USERS
──────────────────────────────────────────────────── */
async function loadUsers(page = 1) {
  usersPage = page;
  const search = document.getElementById('user-search').value.trim();
  const tbody  = document.getElementById('users-tbody');
  tbody.innerHTML = `<tr><td colspan="5" class="loading-cell"><div class="spinner" style="margin:0 auto"></div></td></tr>`;
  try {
    const q = `/api/admin/users?page=${page}&limit=15${search ? '&search=' + encodeURIComponent(search) : ''}`;
    const d = await api('GET', q);
    usersTotalPages = d.pagination.pages || 1;
    document.getElementById('users-count-label').textContent = `${d.pagination.total} user${d.pagination.total !== 1 ? 's' : ''}`;

    if (!d.data.length) {
      tbody.innerHTML = emptyRow(5, '👤', 'No users found', 'Try adjusting your search');
    } else {
      tbody.innerHTML = d.data.map(u => `
        <tr>
          <td>${userCell(u.name, u.email)}</td>
          <td><span class="badge ${u.isSuperAdmin ? 'badge-admin' : 'badge-role'}">${u.isSuperAdmin ? '⭐ super admin' : esc(u.role || 'user')}</span></td>
          <td>${statusBadge(u.isActive)}</td>
          <td style="color:var(--text3);font-size:12px;font-family:var(--mono)">${u.lastLogin ? fmtDate(u.lastLogin) : '—'}</td>
          <td class="actions">${u.isSuperAdmin
            ? '<span style="font-size:11px;color:var(--text3);font-family:var(--mono)">Protected</span>'
            : userActions(u)
          }</td>
        </tr>`).join('');
    }
    renderPagination();
  } catch (e) {
    tbody.innerHTML = emptyRow(5, '⚠️', 'Failed to load users', e.message);
  }
}

function userActions(u) {
  return [
    hasPermission('users:assign_role')
      ? `<button class="icon-btn" title="Assign Role" onclick="openAssignRole('${u._id}','${esc(u.name)}','${esc(u.role||'')}')">🔑</button>` : '',
    hasPermission('users:toggle_status')
      ? `<button class="icon-btn" title="${u.isActive ? 'Deactivate' : 'Activate'}" onclick="toggleStatus('${u._id}','${esc(u.name)}',${u.isActive})">${u.isActive ? '🔒' : '🔓'}</button>` : '',
    hasPermission('users:delete')
      ? `<button class="icon-btn danger" title="Delete User" onclick="openDeleteUser('${u._id}','${esc(u.name)}')">🗑</button>` : '',
  ].join('');
}

function renderPagination() {
  const el = document.getElementById('users-pagination');
  if (usersTotalPages <= 1) { el.innerHTML = ''; return; }
  let btns = '';
  for (let i = 1; i <= usersTotalPages; i++) {
    btns += `<button class="pg-btn${i === usersPage ? ' active' : ''}" onclick="loadUsers(${i})">${i}</button>`;
  }
  el.innerHTML = `
    <span>Page ${usersPage} of ${usersTotalPages}</span>
    <div class="pagination-btns">
      <button class="pg-btn" onclick="loadUsers(${usersPage - 1})" ${usersPage <= 1 ? 'disabled' : ''}>‹ Prev</button>
      ${btns}
      <button class="pg-btn" onclick="loadUsers(${usersPage + 1})" ${usersPage >= usersTotalPages ? 'disabled' : ''}>Next ›</button>
    </div>`;
}

function debounceSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadUsers(1), 400);
}

/* ── ASSIGN ROLE ──────────────────────────────── */
async function openAssignRole(id, name, currentRole) {
  assignRoleUserId = id;
  document.getElementById('role-modal-subtitle').textContent = `Assigning role to ${name}`;
  document.getElementById('role-modal-error').style.display  = 'none';
  const sel = document.getElementById('role-input');
  sel.innerHTML = '<option value="" disabled>Loading roles…</option>';
  document.getElementById('role-modal').classList.add('open');
  try {
    const d     = await api('GET', '/api/admin/roles');
    const roles = d.data || [];
    if (!roles.length) {
      sel.innerHTML = '<option value="" disabled selected>No roles available — create one first</option>';
    } else {
      sel.innerHTML = '<option value="" disabled>— Select a role —</option>' +
        roles.map(r => {
          const val   = r.name;
          const label = r.displayName || r.name;
          return `<option value="${esc(val)}" ${val === currentRole ? 'selected' : ''}>${esc(label)}</option>`;
        }).join('');
      if (!currentRole) sel.selectedIndex = 0;
    }
  } catch {
    sel.innerHTML = '<option value="" disabled selected>Failed to load roles</option>';
  }
}

async function submitAssignRole() {
  const sel  = document.getElementById('role-input');
  const role = sel.value;
  if (!role) { showModalError('role-modal-error', 'Please select a role.'); return; }
  const btn = document.getElementById('assign-role-btn');
  setBtnLoading(btn, true);
  try {
    await api('PUT', `/api/admin/users/${assignRoleUserId}/role`, { role });
    toast(`Role "${role}" assigned successfully.`, 'success');
    closeModal('role-modal');
    loadUsers(usersPage);
  } catch (e) {
    showModalError('role-modal-error', e.message);
  } finally {
    setBtnLoading(btn, false, 'Assign Role');
  }
}

/* ── TOGGLE STATUS ────────────────────────────── */
async function toggleStatus(id, name, isActive) {
  try {
    await api('PUT', `/api/admin/users/${id}/toggle-status`);
    toast(`User "${name}" ${isActive ? 'deactivated' : 'activated'}.`, 'success');
    loadUsers(usersPage);
  } catch (e) {
    toast(e.message, 'error');
  }
}

/* ── DELETE USER ──────────────────────────────── */
function openDeleteUser(id, name) {
  document.getElementById('delete-modal-subtitle').textContent =
    `Delete user "${name}"? This action cannot be undone.`;
  pendingDeleteFn = async () => {
    await api('DELETE', `/api/admin/users/${id}`);
    toast(`User "${name}" deleted.`, 'success');
    loadUsers(usersPage);
  };
  document.getElementById('delete-modal').classList.add('open');
}

async function confirmDelete() {
  const btn = document.getElementById('confirm-delete-btn');
  setBtnLoading(btn, true);
  try {
    await pendingDeleteFn();
    closeModal('delete-modal');
  } catch (e) {
    toast(e.message, 'error');
    closeModal('delete-modal');
  } finally {
    setBtnLoading(btn, false, 'Delete');
  }
}

/* ────────────────────────────────────────────────────
   ROLES
──────────────────────────────────────────────────── */
async function loadRoles() {
  const grid = document.getElementById('roles-grid');
  grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px"><div class="spinner" style="margin:0 auto"></div></div>`;
  try {
    const d = await api('GET', '/api/admin/roles');
    if (!d.data.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">🔑</div>
        <div class="empty-title">No roles yet</div>
        <div class="empty-desc">Create your first role to get started</div>
      </div>`;
      return;
    }
    grid.innerHTML = d.data.map(r => {
      const permCount = (r.permissions || []).length;
      return `
      <div class="role-card">
        <div class="role-card-header">
          <div class="role-icon-wrap">🔑</div>
          ${r.isSystem
            ? `<span class="badge badge-system">System</span>`
            : `<div style="display:flex;gap:6px">
                ${hasPermission('roles:edit')   ? `<button class="icon-btn" title="Edit role" onclick="openEditRole('${r._id}','${esc(r.displayName || r.name)}','${esc(r.description || '')}')">✏️</button>` : ''}
                ${hasPermission('roles:delete') ? `<button class="icon-btn danger" title="Delete role" onclick="openDeleteRole('${r._id}','${esc(r.displayName || r.name)}')">🗑</button>` : ''}
               </div>`}
        </div>
        <div class="role-name">${esc(r.displayName || r.name)}</div>
        <div class="role-desc">${r.description ? esc(r.description) : '<em style="opacity:.38">No description</em>'}</div>
        <div class="role-meta">
          <div class="role-user-count">👥 ${r.userCount} user${r.userCount !== 1 ? 's' : ''}</div>
          <div class="role-perms-count">🛡️ ${permCount} perm${permCount !== 1 ? 's' : ''}</div>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">⚠️</div><div class="empty-title">Failed to load roles</div><div class="empty-desc">${esc(e.message)}</div></div>`;
  }
}

function openCreateRoleModal() {
  document.getElementById('new-role-name').value = '';
  document.getElementById('new-role-desc').value = '';
  document.getElementById('create-role-error').style.display = 'none';
  document.getElementById('create-role-modal').classList.add('open');
  setTimeout(() => document.getElementById('new-role-name').focus(), 60);
}

async function submitCreateRole() {
  const name        = document.getElementById('new-role-name').value.trim();
  const description = document.getElementById('new-role-desc').value.trim();
  if (!name) { showModalError('create-role-error', 'Role name is required.'); return; }
  const btn = document.getElementById('create-role-btn');
  setBtnLoading(btn, true);
  try {
    await api('POST', '/api/admin/roles', { name, description });
    toast(`Role "${name}" created.`, 'success');
    closeModal('create-role-modal');
    loadRoles();
  } catch (e) {
    showModalError('create-role-error', e.message);
  } finally {
    setBtnLoading(btn, false, 'Create Role');
  }
}

function openEditRole(id, displayName, description) {
  editRoleId = id;
  document.getElementById('edit-role-subtitle').textContent = `Editing: ${displayName}`;
  document.getElementById('edit-role-name').value           = displayName;
  document.getElementById('edit-role-desc').value           = description;
  document.getElementById('edit-role-error').style.display  = 'none';
  document.getElementById('edit-role-modal').classList.add('open');
  setTimeout(() => document.getElementById('edit-role-name').focus(), 60);
}

async function submitEditRole() {
  const name        = document.getElementById('edit-role-name').value.trim();
  const description = document.getElementById('edit-role-desc').value.trim();
  if (!name) { showModalError('edit-role-error', 'Role name is required.'); return; }
  const btn = document.getElementById('edit-role-btn');
  setBtnLoading(btn, true);
  try {
    await api('PUT', `/api/admin/roles/${editRoleId}`, { name, description });
    toast('Role updated successfully.', 'success');
    closeModal('edit-role-modal');
    loadRoles();
  } catch (e) {
    showModalError('edit-role-error', e.message);
  } finally {
    setBtnLoading(btn, false, 'Save Changes');
  }
}

function openDeleteRole(id, name) {
  document.getElementById('delete-modal-subtitle').textContent =
    `Delete role "${name}"? Users with this role will be reset to "user".`;
  pendingDeleteFn = async () => {
    await api('DELETE', `/api/admin/roles/${id}`);
    toast(`Role "${name}" deleted.`, 'success');
    loadRoles();
  };
  document.getElementById('delete-modal').classList.add('open');
}

/* ────────────────────────────────────────────────────
   PERMISSIONS
──────────────────────────────────────────────────── */
const PERMISSION_GROUPS = [
  {
    label: 'User Management',
    perms: [
      { key: 'users:view',          name: 'View Users',         desc: 'See user list & details' },
      { key: 'users:create',        name: 'Create Users',       desc: 'Add new users' },
      { key: 'users:edit',          name: 'Edit Users',         desc: 'Update user info' },
      { key: 'users:delete',        name: 'Delete Users',       desc: 'Remove users permanently' },
      { key: 'users:toggle_status', name: 'Toggle Status',      desc: 'Activate or deactivate users' },
      { key: 'users:assign_role',   name: 'Assign Roles',       desc: "Change a user's role" },
    ],
  },
  {
    label: 'Role Management',
    perms: [
      { key: 'roles:view',   name: 'View Roles',   desc: 'See all roles' },
      { key: 'roles:create', name: 'Create Roles', desc: 'Add new roles' },
      { key: 'roles:edit',   name: 'Edit Roles',   desc: 'Update role details' },
      { key: 'roles:delete', name: 'Delete Roles', desc: 'Remove roles' },
    ],
  },
  {
    label: 'Dashboard & Reports',
    perms: [
      { key: 'dashboard:view',  name: 'View Dashboard', desc: 'Access the main dashboard' },
      { key: 'dashboard:stats', name: 'View Stats',      desc: 'See user & role statistics' },
      { key: 'reports:export',  name: 'Export Data',     desc: 'Download reports & exports' },
    ],
  },
  {
    label: 'Permissions',
    perms: [
      { key: 'permissions:view',   name: 'View Permissions',   desc: 'See permission settings' },
      { key: 'permissions:manage', name: 'Manage Permissions', desc: 'Edit role permissions' },
    ],
  },
];

const ALL_PERMS = PERMISSION_GROUPS.flatMap(g => g.perms.map(p => p.key));

let permRoles       = [];
let activePermRoleId = null;

async function loadPermissions() {
  const container = document.getElementById('permissions-container');
  container.innerHTML = `<div style="text-align:center;padding:48px;width:100%"><div class="spinner" style="margin:0 auto"></div></div>`;
  try {
    const d = await api('GET', '/api/admin/roles');
    permRoles = (d.data || []).filter(r => !r.isSystem);
    if (!permRoles.length) {
      container.innerHTML = `<div class="empty-state" style="width:100%">
        <div class="empty-icon">🛡️</div>
        <div class="empty-title">No custom roles yet</div>
        <div class="empty-desc">Create a role first, then manage its permissions here.</div>
      </div>`;
      return;
    }
    activePermRoleId = permRoles[0]._id;
    renderPermissionsUI();
  } catch (e) {
    container.innerHTML = `<div class="empty-state" style="width:100%"><div class="empty-icon">⚠️</div><div class="empty-title">Failed to load</div><div class="empty-desc">${esc(e.message)}</div></div>`;
  }
}

function renderPermissionsUI() {
  const container  = document.getElementById('permissions-container');
  const activeRole = permRoles.find(r => r._id === activePermRoleId);
  const activePerms= new Set(activeRole ? (activeRole.permissions || []) : []);

  const tabsHtml = permRoles.map(r => `
    <div class="perm-role-tab ${r._id === activePermRoleId ? 'active' : ''}" onclick="selectPermRole('${r._id}')">
      🔑 ${esc(r.displayName || r.name)}
    </div>`).join('');

  const totalPerms = ALL_PERMS.length;
  const checkedCount = ALL_PERMS.filter(k => activePerms.has(k)).length;
  const allChecked   = checkedCount === totalPerms;

  const groupsHtml = PERMISSION_GROUPS.map(g => {
    const groupChecked = g.perms.filter(p => activePerms.has(p.key)).length;
    return `
    <div class="perm-group">
      <div class="perm-group-label">${g.label} <span style="opacity:.5">${groupChecked}/${g.perms.length}</span></div>
      <div class="perm-checks">
        ${g.perms.map(p => `
          <label class="perm-check-item">
            <input type="checkbox" data-perm="${p.key}" ${activePerms.has(p.key) ? 'checked' : ''} />
            <span class="perm-check-label">
              <strong>${p.name}</strong>
              <span>${p.desc}</span>
            </span>
          </label>`).join('')}
      </div>
    </div>`;
  }).join('');

  container.innerHTML = `
    <div class="perm-layout">
      <div class="perm-role-list">${tabsHtml}</div>
      <div class="perm-panel">
        <div class="perm-panel-header">
          <div class="perm-panel-title">🛡️ ${esc(activeRole ? (activeRole.displayName || activeRole.name) : '')} — Permissions</div>
          <div class="perm-panel-sub">Check or uncheck permissions for this role. Click Save when done.</div>
        </div>

        <div class="perm-select-all-row">
          <span>${checkedCount} of ${totalPerms} permissions enabled</span>
          <div style="display:flex;gap:8px">
            <button class="btn btn-ghost btn-sm" onclick="toggleAllPerms(false)">Clear All</button>
            <button class="btn btn-ghost btn-sm" onclick="toggleAllPerms(true)">Select All</button>
          </div>
        </div>

        ${groupsHtml}

        <div class="perm-save-bar">
          <span class="perm-save-hint">Changes are not applied until saved.</span>
          <button class="btn btn-blue btn-sm" id="perm-save-btn" onclick="savePermissions()">Save Permissions</button>
        </div>
      </div>
    </div>`;
}

function selectPermRole(id) {
  activePermRoleId = id;
  renderPermissionsUI();
}

function toggleAllPerms(checked) {
  document.querySelectorAll('#permissions-container input[type=checkbox]')
    .forEach(cb => cb.checked = checked);
  // Re-render counts
  const count = checked ? ALL_PERMS.length : 0;
  const el = document.querySelector('.perm-select-all-row span');
  if (el) el.textContent = `${count} of ${ALL_PERMS.length} permissions enabled`;
}

async function savePermissions() {
  const checked = [...document.querySelectorAll('#permissions-container input[type=checkbox]:checked')]
    .map(el => el.dataset.perm);
  const btn = document.getElementById('perm-save-btn');
  setBtnLoading(btn, true);
  try {
    await api('PUT', `/api/admin/roles/${activePermRoleId}/permissions`, { permissions: checked });
    const role = permRoles.find(r => r._id === activePermRoleId);
    if (role) role.permissions = checked;
    toast('Permissions saved successfully.', 'success');
    renderPermissionsUI(); // re-render to update counts
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    setBtnLoading(btn, false, 'Save Permissions');
  }
}

/* ────────────────────────────────────────────────────
   MODAL HELPERS
──────────────────────────────────────────────────── */
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function showModalError(elId, msg) {
  const el = document.getElementById(elId);
  el.textContent  = msg;
  el.style.display = '';
}

function setBtnLoading(btn, loading, label) {
  if (loading) {
    btn.disabled  = true;
    btn.innerHTML = '<span class="spinner"></span>';
  } else {
    btn.disabled  = false;
    btn.textContent = label;
  }
}

/* ────────────────────────────────────────────────────
   SIDEBAR
──────────────────────────────────────────────────── */
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

/* ────────────────────────────────────────────────────
   UTILITIES
──────────────────────────────────────────────────── */
function esc(s) {
  return String(s)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function userCell(name, email) {
  const initials = name.slice(0, 2).toUpperCase();
  return `<div class="user-cell">
    <div class="avatar-sm">${esc(initials)}</div>
    <div>
      <div class="user-cell-name">${esc(name)}</div>
      <div class="user-cell-email">${esc(email)}</div>
    </div>
  </div>`;
}

function statusBadge(isActive) {
  return isActive
    ? '<span class="badge badge-active">● Active</span>'
    : '<span class="badge badge-inactive">○ Inactive</span>';
}

function emptyRow(cols, icon, title, desc = '') {
  return `<tr><td colspan="${cols}"><div class="empty-state">
    <div class="empty-icon">${icon}</div>
    <div class="empty-title">${esc(title)}</div>
    ${desc ? `<div class="empty-desc">${esc(desc)}</div>` : ''}
  </div></td></tr>`;
}

/* ────────────────────────────────────────────────────
   GLOBAL EVENT LISTENERS
──────────────────────────────────────────────────── */
// Close modals on backdrop click
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
});

// ESC closes modals
document.addEventListener('keydown', e => {
  if (e.key === 'Escape')
    document.querySelectorAll('.modal-overlay').forEach(o => o.classList.remove('open'));
});

/* ────────────────────────────────────────────────────
   BOOT — auto-login if token exists
──────────────────────────────────────────────────── */
(async () => {
  if (!token) return;
  try {
    const d    = await api('GET', '/api/auth/me');
    currentUser = d.user;
    enterDashboard();
  } catch {
    token = '';
    localStorage.removeItem('drbac_token');
  }
})();
