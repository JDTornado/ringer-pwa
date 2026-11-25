/** Short commit SHA of this build, injected by Vite's `define` (vite.config.ts). */
declare const __BUILD_ID__: string;

interface ImportMetaEnv {
  /** Supabase API URL. Local: http://127.0.0.1:54321 (see .env.example). */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase publishable (anon) key: safe in the browser; RLS does the guarding. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
