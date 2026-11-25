// Test accounts on LOCAL Supabase (never the hosted project). playwright.config.ts
// reads the URL and keys from `supabase status`, so `npm run db:start` must be
// running before `npm run test:e2e`.
import { createClient, type Session } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';
import { localSupabase } from './local-supabase.mjs';

const { url, publishableKey, serviceKey, mailpitUrl } = localSupabase();

const noPersist = { auth: { persistSession: false, autoRefreshToken: false } };
export const admin = () => createClient(url, serviceKey, noPersist);
const anon = () => createClient(url, publishableKey, noPersist);

/** localStorage key the app keeps its session under (src/lib/supabase.ts). */
export const SESSION_KEY = 'ringer:auth';

let counter = 0;
export const uniqueEmail = (tag: string) =>
  `e2e-${tag}-${counter++}-${crypto.randomUUID().slice(0, 8)}@ringer.test`;

export interface TestPlayer {
  id: string;
  name: string;
}

/** A league (non-guest) player with no account, as an admin would add one. */
export async function createPlayer(name: string): Promise<TestPlayer> {
  const { data, error } = await admin().from('players').insert({ display_name: name, is_guest: false }).select('id').single();
  if (error) throw error;
  return { id: data.id, name };
}

export interface TestMember {
  email: string;
  userId: string;
  player: TestPlayer;
  session: Session;
}

/** An account already linked to its own new player, with a live session. */
export async function createMember(tag: string): Promise<TestMember> {
  const email = uniqueEmail(tag);
  const a = admin();
  const { data: created, error: ce } = await a.auth.admin.createUser({ email, email_confirm: true });
  if (ce) throw ce;
  const userId = created.user.id;
  const player = await createPlayer(`E2E ${tag} ${counter}`);
  const { error: le } = await a.from('players').update({ auth_user_id: userId }).eq('id', player.id);
  if (le) throw le;
  // Sign in the same way the app does (an email OTP), minus the inbox.
  const { data: link, error: ge } = await a.auth.admin.generateLink({ type: 'magiclink', email });
  if (ge) throw ge;
  const { data: v, error: ve } = await anon().auth.verifyOtp({ email, token: link.properties.email_otp, type: 'email' });
  if (ve || !v.session) throw ve ?? new Error('no session');
  return { email, userId, player, session: v.session };
}

/** Remove a test account and any players it created or claimed. */
export async function deleteAccount(email: string, playerIds: string[] = []): Promise<void> {
  const a = admin();
  const { data } = await a.auth.admin.listUsers({ perPage: 1000 });
  const user = data.users.find((u) => u.email === email);
  if (user) await a.auth.admin.deleteUser(user.id);
  if (playerIds.length) await a.from('players').delete().in('id', playerIds);
}

/** Start the page already signed in as `member` (a saved session, as after a real sign-in). */
export async function useSession(page: Page, session: Session): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    [SESSION_KEY, JSON.stringify(session)] as const,
  );
}

/** The newest 6-digit code emailed to `email` (from the local Mailpit inbox). */
export async function latestCode(email: string, after = 0): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const list = (await res.json()) as { messages: { ID: string; Created: string }[] };
    const msg = list.messages.find((m) => Date.parse(m.Created) >= after);
    if (msg) {
      const full = (await (await fetch(`${mailpitUrl}/api/v1/message/${msg.ID}`)).json()) as { Text: string };
      const code = /\b(\d{6})\b/.exec(full.Text)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no code emailed to ${email}`);
}
