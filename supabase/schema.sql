-- ============================================================
--  DRBAC — Supabase Schema
--  Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── ROLES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.roles (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL UNIQUE,          -- slug e.g. "editor"
  display_name TEXT        NOT NULL,                 -- pretty e.g. "Editor"
  description  TEXT        NOT NULL DEFAULT '',
  permissions  TEXT[]      NOT NULL DEFAULT '{}',    -- e.g. ['users:view','roles:view']
  is_system    BOOLEAN     NOT NULL DEFAULT FALSE,   -- system roles cannot be deleted/edited
  created_by   UUID,                                  -- FK added after users table exists
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── USERS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  email            TEXT        NOT NULL UNIQUE,
  password_hash    TEXT        NOT NULL,
  role             TEXT        NOT NULL DEFAULT 'user',  -- matches roles.name
  is_super_admin   BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  assigned_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  role_assigned_at TIMESTAMPTZ,
  last_login       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK now that users table exists
ALTER TABLE public.roles
  ADD CONSTRAINT roles_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- Disable RLS — backend uses the service_role key which bypasses RLS anyway.
-- Enable RLS + policies via supabase/rls_policies.sql if you want row-level security.
ALTER TABLE public.roles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- ── AUTO-UPDATE updated_at ────────────────────────────────────
CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_roles_updated_at
  BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- ── SEED: built-in "viewer" role ─────────────────────────────
INSERT INTO public.roles (name, display_name, description, permissions, is_system)
VALUES (
  'viewer', 'Viewer',
  'Read-only access — can see dashboard and user list.',
  ARRAY['dashboard:view','dashboard:stats','users:view','roles:view'],
  TRUE
) ON CONFLICT (name) DO NOTHING;
