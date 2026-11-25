// The Supabase client. Its URL and publishable key come from the build's env
// (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY; see .env.example). A build
// without them (e.g. a branch preview with no env set) is "unconfigured" and the
// app says sign-in isn't set up instead of crashing.
//
// The client is created on first use, not at import: creating it immediately
// tries to refresh an expired saved session, which is pointless (and noisy)
// when the app is launched with no network.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export type Client = SupabaseClient<Database>;

/** localStorage key for the saved session (tests seed it; offline start reads it). */
export const SESSION_STORAGE_KEY = 'ringer:auth';

export const supabaseConfigured = Boolean(url && key);

let client: Client | null = null;

/** The client, created on first call; null if this build has no Supabase env. */
export function getSupabase(): Client | null {
  if (!url || !key) return null;
  client ??= createClient<Database>(url, key, {
    auth: {
      // localStorage: the installed app keeps it (iOS keeps the home-screen
      // app's storage separate from Safari's, so sign-in happens in the app).
      persistSession: true,
      storageKey: SESSION_STORAGE_KEY,
      autoRefreshToken: true,
      // Codes are typed in, never links: no tokens arrive in the URL.
      detectSessionInUrl: false,
    },
  });
  return client;
}

/** True if this device has a saved session (it may be expired). */
export function hasSavedSession(): boolean {
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}
