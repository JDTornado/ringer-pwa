/** Read `supabase status` into process.env (runner only; local Supabase only). */
export function loadLocalSupabase(): void;

export interface LocalSupabase {
  url: string;
  publishableKey: string;
  serviceKey: string;
  mailpitUrl: string;
}

/** The values loadLocalSupabase() set, as seen by a test worker. */
export function localSupabase(): LocalSupabase;
