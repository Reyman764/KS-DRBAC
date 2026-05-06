const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

// IMPORTANT: serviceRole bypasses RLS — must use service_role key, NOT anon key
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    headers: {
      // Explicitly tell Supabase to use service role (bypasses RLS)
      Authorization: `Bearer ${supabaseServiceKey}`,
    },
  },
  db: {
    schema: 'public',
  },
});

module.exports = supabase;
