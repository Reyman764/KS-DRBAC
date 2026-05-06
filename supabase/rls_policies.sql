-- ============================================================
--  DRBAC — RLS Policies
--  Run this in Supabase SQL Editor after enabling RLS
-- ============================================================

-- ── USERS TABLE ──────────────────────────────────────────────

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "service_role_full_access_users" ON public.users;
DROP POLICY IF EXISTS "allow_insert_users" ON public.users;
DROP POLICY IF EXISTS "allow_select_users" ON public.users;
DROP POLICY IF EXISTS "allow_update_users" ON public.users;
DROP POLICY IF EXISTS "allow_delete_users" ON public.users;

-- Service role has FULL access (bypasses RLS for your backend)
-- This policy covers all operations when using SUPABASE_SERVICE_ROLE_KEY
CREATE POLICY "service_role_full_access_users"
  ON public.users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── ROLES TABLE ───────────────────────────────────────────────

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "service_role_full_access_roles" ON public.roles;

-- Service role has FULL access
CREATE POLICY "service_role_full_access_roles"
  ON public.roles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ============================================================
--  VERIFY: Check your keys in the Supabase dashboard
--  Settings → API
--
--  ✅ Use "service_role" key  → in your .env as SUPABASE_SERVICE_ROLE_KEY
--  ❌ Never use "anon" key    → that key CANNOT bypass RLS
-- ============================================================
