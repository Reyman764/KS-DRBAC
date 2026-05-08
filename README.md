# 🛡️ DRBAC — Dynamic Role-Based Access Control

A full-stack admin dashboard for managing users, roles, and fine-grained permissions — built with **Node.js + Express**, **Supabase (PostgreSQL)**, and a zero-dependency vanilla-JS frontend.

---

## ✨ Features

| Feature | Details |
|---|---|
| **JWT Authentication** | Signup / Login / Auto-session restore |
| **Super Admin** | Immutable top-level account, full system access |
| **Dynamic Roles** | Create, edit, delete roles with display names |
| **Permission Checkboxes** | Assign permissions when creating *or* editing a role |
| **Assign Role (dropdown)** | Users view → 🔑 button → dropdown of all existing roles |
| **Permissions View** | Per-role check/uncheck panel; respects `permissions:manage` |
| **User Management** | Search, paginate, toggle status, delete |
| **Permission Guards** | Every route & UI element hidden/blocked if permission missing |
| **XSS Safe** | All user-supplied strings run through `esc()` before render |

---

## 🗂️ Project Structure

```
KS-DRBAC-v3/
├── config/
│   └── supabase.js          Supabase client (service role)
├── controllers/
│   ├── adminController.js   Users, roles, permissions, stats
│   ├── authController.js    Signup, login, getMe
│   └── protectedController.js  Generic authenticated route
├── middleware/
│   └── auth.js              protect · requireSuperAdmin · requirePermission · requireRole
├── routes/
│   ├── admin.js             /api/admin/*
│   ├── auth.js              /api/auth/*
│   └── protected.js         /api/protected/*
├── utils/
│   └── mappers.js           toPublicUser — maps DB rows → safe JS objects
├── public/
│   ├── index.html           Single-page app shell + modals
│   ├── app.js               All frontend logic
│   └── app.css              Styles
├── supabase/
│   ├── schema.sql           Tables, triggers, seed data
│   └── rls_policies.sql     Optional Row Level Security
├── index.js                 Express entry point
├── package.json
├── .env.example
└── README.md
```

---

## 🚀 Quick Start

### 1 — Supabase setup

1. Create a free project at [supabase.com](https://supabase.com).
2. Go to **Dashboard → SQL Editor → New Query**, paste `supabase/schema.sql`, and run it.
3. *(Optional)* Run `supabase/rls_policies.sql` to enable Row Level Security.
4. Copy your **Project URL** and **service_role** API key from **Settings → API**.

### 2 — Environment

```bash
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET
```

### 3 — Install & run

```bash
npm install
npm run dev      # nodemon (dev)
npm start        # plain node (prod)
```

Open **http://localhost:5000** in your browser.

### 4 — Create your first Super Admin

Run this SQL in the Supabase SQL Editor (replace values first):

```sql
-- 1. Hash the password (run in Node.js to get bcrypt hash):
--    node -e "const b=require('bcryptjs'); b.hash('YourPassword123',12).then(console.log)"
-- 2. Insert the super admin:
INSERT INTO public.users (name, email, password_hash, role, is_super_admin)
VALUES ('Super Admin', 'admin@example.com', '<bcrypt_hash_here>', 'superadmin', TRUE);
```

---

## 🔐 Permission System

### All available permission keys

| Category | Key | Description |
|---|---|---|
| Users | `users:view` | See user list |
| | `users:create` | Add new users |
| | `users:edit` | Update user info |
| | `users:delete` | Remove users |
| | `users:toggle_status` | Activate / deactivate |
| | `users:assign_role` | Change a user's role |
| Roles | `roles:view` | See all roles |
| | `roles:create` | Add new roles |
| | `roles:edit` | Update role details & permissions |
| | `roles:delete` | Remove roles |
| Dashboard | `dashboard:view` | Access dashboard |
| | `dashboard:stats` | See stats |
| | `reports:export` | Export data |
| Permissions | `permissions:view` | See permission settings |
| | `permissions:manage` | Edit role permissions |

### How it works

1. Each **role** stores a `permissions TEXT[]` column in Supabase.
2. On login, `/api/auth/me` fetches the user's role and returns its permissions array.
3. The frontend stores this in `currentUser.permissions` and gates every nav item, button, and API call.
4. The backend's `requirePermission('key')` middleware re-checks the DB on every request.
5. **Super Admins** bypass all permission checks.

---

## 📡 API Reference

### Auth

| Method | Route | Body | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | `{name, email, password}` | Register |
| POST | `/api/auth/login` | `{email, password}` | Login → JWT |
| GET | `/api/auth/me` | — | Current user + permissions |

### Admin (all require `Authorization: Bearer <token>`)

| Method | Route | Guard | Description |
|---|---|---|---|
| GET | `/api/admin/stats` | `protect` | Dashboard stats |
| GET | `/api/admin/users` | `users:view` | Paginated user list |
| PUT | `/api/admin/users/:id/role` | `users:assign_role` | Assign role (from dropdown) |
| PUT | `/api/admin/users/:id/toggle-status` | `users:toggle_status` | Activate/deactivate |
| DELETE | `/api/admin/users/:id` | `users:delete` | Delete user |
| GET | `/api/admin/roles` | `roles:view` | All roles + user counts |
| POST | `/api/admin/roles` | `roles:create` | Create role + initial permissions |
| PUT | `/api/admin/roles/:id` | `roles:edit` | Update name, description, permissions |
| PUT | `/api/admin/roles/:id/permissions` | `requireSuperAdmin` | Replace permissions array |
| DELETE | `/api/admin/roles/:id` | `roles:delete` | Delete role |

---

## 🐛 Bugs Fixed vs v2

| File | Bug | Fix |
|---|---|---|
| `utils/mappers.js` | **Missing file** — all controllers crashed on import | Created with `toPublicUser()` |
| `middleware/auth.js` | `requirePermission` re-required `supabase` inside the closure, shadowing the module-level import | Removed inner `require`, uses outer const |
| `controllers/adminController.js` | `escapeLike` stripped `%` and `_` instead of escaping them, breaking search | Fixed to `\%` / `\_` escaping |
| `controllers/adminController.js` | `assignRole` did not verify the target role exists before assigning | Added role existence check |
| `controllers/adminController.js` | `updateRole` ignored `permissions` in request body | Now accepts and saves `permissions[]` |
| `public/app.js` | `openEditRole` only passed name + description, not permissions | Now passes `permissions[]` from role card |
| `public/app.js` | `esc(null)` threw TypeError | Added `?? ''` null-coalescing guard |

---

## 🏗️ Tech Stack

- **Runtime** — Node.js (≥ 18)
- **Framework** — Express 4
- **Database** — Supabase (PostgreSQL)
- **Auth** — JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`)
- **Frontend** — Vanilla JS + CSS (zero build step)
