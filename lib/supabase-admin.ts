import { createClient } from '@supabase/supabase-js';

// SERVER-ONLY client using the service_role key.
// This bypasses Row Level Security entirely — never import this
// file from any 'use client' component or expose it to the browser.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
