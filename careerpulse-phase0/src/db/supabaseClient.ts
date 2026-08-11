/**
 * Supabase Client — Backend / Service Role
 *
 * WHY SERVICE ROLE KEY (not anon key)?
 * ------------------------------------
 * This code runs as a backend scraping script, not in a user's browser.
 * The anon key respects Row Level Security, which means it can only do
 * what authenticated end-users are allowed to do (read companies/jobs,
 * manage own subscriptions). But our scraper needs to INSERT and UPDATE
 * companies and jobs — operations we deliberately blocked for regular
 * users via RLS. The service_role key bypasses RLS entirely, giving us
 * full admin access. This is safe because the key never leaves our
 * server-side scripts and is never exposed to the client.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error(
        'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.\n' +
        'Copy .env.example to .env and fill in your Supabase project credentials.'
    );
    process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        // We're using the service role key, so we don't need to persist
        // sessions or auto-refresh tokens — this isn't a user session.
        autoRefreshToken: false,
        persistSession: false,
    },
});
