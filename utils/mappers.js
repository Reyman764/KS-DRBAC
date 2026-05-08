'use strict';

/**
 * Map a raw Supabase user row → safe public object.
 * All controllers and middleware import { toPublicUser } from here.
 *
 * Field name conventions used everywhere in the codebase:
 *   DB column        → JS camelCase key
 *   id               → _id
 *   is_super_admin   → isSuperAdmin
 *   is_active        → isActive
 *   last_login       → lastLogin
 *   created_at       → createdAt
 *   updated_at       → updatedAt
 *
 * NOTE: password_hash is intentionally NEVER returned.
 */
function toPublicUser(row) {
  if (!row) return null;
  return {
    _id:          row.id,
    name:         row.name,
    email:        row.email,
    role:         row.role        ?? 'user',
    isSuperAdmin: row.is_super_admin ?? false,
    isActive:     row.is_active   ?? true,
    permissions:  row.permissions ?? [],
    lastLogin:    row.last_login  ?? null,
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
    // assignedBy is optionally merged in by withAssignedBy() in adminController
    assignedBy:   row.assignedBy  ?? null,
  };
}

module.exports = { toPublicUser };
