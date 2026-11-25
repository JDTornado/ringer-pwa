// Local Supabase settings for e2e (plain JS: the e2e tsconfig has no Node types).
//
// loadLocalSupabase() runs once in the Playwright runner (playwright.config.ts):
// it reads `supabase status` and puts the URL and keys in process.env, which
// builds (webServer, deploy-sim) and test workers inherit. VITE_* in
// process.env beats .env.local. It refuses anything that isn't local.
import { execSync } from 'node:child_process';

export function loadLocalSupabase() {
  if (process.env.E2E_SUPABASE_SERVICE_KEY) return;
  let status;
  try {
    status = JSON.parse(
      execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
    );
  } catch {
    throw new Error('Local Supabase is not running. Start Docker Desktop, then `npm run db:start`.');
  }
  const need = (k) => {
    if (!status[k]) throw new Error(`supabase status has no ${k}`);
    return status[k];
  };
  const apiUrl = need('API_URL');
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(apiUrl)) {
    throw new Error(`e2e must run against local Supabase, not ${apiUrl}`);
  }
  process.env.VITE_SUPABASE_URL = apiUrl;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = need('PUBLISHABLE_KEY');
  process.env.E2E_SUPABASE_SERVICE_KEY = need('SERVICE_ROLE_KEY');
  process.env.E2E_MAILPIT_URL = status.MAILPIT_URL ?? status.INBUCKET_URL ?? 'http://127.0.0.1:54324';
}

/** The values loadLocalSupabase() set (read in test workers). */
export function localSupabase() {
  return {
    url: process.env.VITE_SUPABASE_URL ?? '',
    publishableKey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    serviceKey: process.env.E2E_SUPABASE_SERVICE_KEY ?? '',
    mailpitUrl: process.env.E2E_MAILPIT_URL ?? '',
  };
}
