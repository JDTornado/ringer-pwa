// Who is using the app: the signed-in account and the player it's linked to.
//
// Scoring needs a signed-in account that has claimed its player ('ready').
// Sign-in is a 6-digit code sent by email and typed in (signInWithOtp +
// verifyOtp, type 'email'), not a magic link: on iOS the installed app's
// storage is separate from Safari's, so a link opened from Mail would sign in
// the wrong one. Other sign-in methods (Google, later) would end in the same
// place: a Supabase session, then resolve().
//
// Offline: supabase-js keeps the session in localStorage. Once the access
// token expires it can't refresh without a network, and getSession() then
// reports no session with a retryable fetch error. In that case we keep the
// account we last confirmed online (cached below), so a scorekeeper who
// signed in earlier can still score with no signal. The cache is never
// trusted over a server answer: a real sign-out or a revoked session clears it.

import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { getSupabase, hasSavedSession, supabaseConfigured, type Client } from '../lib/supabase';
import type { RosterEntry } from '../lib/signin';

export type AccountStatus =
  | 'loading'
  | 'unconfigured' // this build has no Supabase URL/key
  | 'signedOut'
  | 'unlinked' // signed in, no player claimed yet
  | 'unreachable' // signed in, but couldn't load the account and nothing cached
  | 'ready';

export interface LinkedAccount {
  userId: string;
  email: string;
  playerId: string;
  playerName: string;
}

const CACHE_KEY = 'ringer:account';

function readCache(): LinkedAccount | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (
      typeof v === 'object' && v !== null &&
      'userId' in v && typeof v.userId === 'string' &&
      'email' in v && typeof v.email === 'string' &&
      'playerId' in v && typeof v.playerId === 'string' &&
      'playerName' in v && typeof v.playerName === 'string'
    ) {
      return { userId: v.userId, email: v.email, playerId: v.playerId, playerName: v.playerName };
    }
  } catch {
    // Unreadable cache = no cache.
  }
  return null;
}

function writeCache(a: LinkedAccount | null): void {
  try {
    if (a) localStorage.setItem(CACHE_KEY, JSON.stringify(a));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    // Storage full or blocked: we just won't work offline until it's fixed.
  }
}

/** A message a person can act on, from whatever a Supabase call threw. */
export function friendlyError(err: unknown): string {
  if (isAuthRetryableFetchError(err) || (err instanceof TypeError && /fetch/i.test(err.message))) {
    return "Can't reach the server. Check your connection and try again.";
  }
  const e = err as { status?: number; code?: string; message?: string } | null;
  if (e?.status === 429 || e?.code === 'over_email_send_rate_limit' || e?.code === 'over_request_rate_limit') {
    return 'Too many tries. Wait a minute, then try again.';
  }
  if (e?.code === 'otp_expired' || /expired|invalid/i.test(e?.message ?? '')) {
    return "That code didn't work. Check it, or send a new one.";
  }
  return e?.message || 'Something went wrong. Try again.';
}

class AccountState {
  status = $state<AccountStatus>('loading');
  /** Set once linked (or from the offline cache). */
  account = $state<LinkedAccount | null>(null);
  /** The signed-in email (also while unlinked). */
  email = $state<string | null>(null);
  /** True when 'ready' comes from the cache because the server can't be reached. */
  offline = $state(false);

  // ---- Sign-in flow ---------------------------------------------------------
  /** The email a code was sent to; null = still on the email step. */
  codeSentTo = $state<string | null>(null);
  busy = $state(false);
  error = $state<string | null>(null);

  private started = false;
  /** Set on first use (see getSupabase): not created at all on an offline launch. */
  private sb: Client | null = null;

  private client(): Client | null {
    if (this.sb) return this.sb;
    const sb = getSupabase();
    if (!sb) return null;
    sb.auth.onAuthStateChange((event) => {
      // Don't call Supabase from inside this callback (it holds the auth lock).
      if (event === 'SIGNED_OUT') setTimeout(() => this.setSignedOut(), 0);
    });
    this.sb = sb;
    return sb;
  }

  async init(): Promise<void> {
    if (this.started) return;
    this.started = true;
    if (!supabaseConfigured) {
      this.status = 'unconfigured';
      return;
    }
    // No point refreshing tokens with no network; catch up when it's back.
    window.addEventListener('offline', () => void this.sb?.auth.stopAutoRefresh());
    window.addEventListener('online', () => {
      void this.sb?.auth.startAutoRefresh();
      if (this.offline) void this.recheck();
    });

    // Known offline at launch: use the saved sign-in without touching the
    // network. The client is created once we're back online.
    const cached = readCache();
    if (navigator.onLine === false && cached && hasSavedSession()) {
      this.useCacheOffline(cached);
      return;
    }

    const sb = this.client();
    if (!sb) return;
    const { data, error } = await sb.auth.getSession();
    if (data.session) {
      await this.resolve(data.session);
    } else if (error && isAuthRetryableFetchError(error) && readCache()) {
      this.useCacheOffline(readCache());
    } else {
      this.setSignedOut();
    }
  }

  /** Work out where a signed-in session stands: linked, unlinked, or offline. */
  private async resolve(session: Session): Promise<void> {
    const supabase = this.client();
    if (!supabase) return;
    const userId = session.user.id;
    const email = session.user.email ?? '';
    this.email = email;
    const { data, error } = await supabase
      .from('players')
      .select('id, display_name')
      .eq('auth_user_id', userId)
      .is('merged_into_player_id', null)
      .maybeSingle();
    if (error) {
      const cached = readCache();
      if (cached && cached.userId === userId) this.useCacheOffline(cached);
      else {
        this.account = null;
        this.status = 'unreachable';
      }
      return;
    }
    this.offline = false;
    if (data) {
      const linked: LinkedAccount = { userId, email, playerId: data.id, playerName: data.display_name };
      writeCache(linked);
      this.account = linked;
      this.status = 'ready';
    } else {
      writeCache(null);
      this.account = null;
      this.status = 'unlinked';
    }
  }

  private useCacheOffline(cached: LinkedAccount | null): void {
    if (!cached) return this.setSignedOut();
    this.account = cached;
    this.email = cached.email;
    this.offline = true;
    this.status = 'ready';
  }

  private setSignedOut(): void {
    writeCache(null);
    this.account = null;
    this.email = null;
    this.offline = false;
    this.codeSentTo = null;
    this.error = null;
    this.busy = false;
    this.status = 'signedOut';
  }

  /** Back online after an offline start: confirm the account with the server. */
  private async recheck(): Promise<void> {
    const supabase = this.client();
    if (!supabase) return;
    const { data, error } = await supabase.auth.getSession();
    if (data.session) await this.resolve(data.session);
    else if (!(error && isAuthRetryableFetchError(error))) this.setSignedOut();
  }

  /** Retry after 'unreachable'. */
  async retry(): Promise<void> {
    const supabase = this.client();
    if (!supabase) return;
    this.status = 'loading';
    const { data } = await supabase.auth.getSession();
    if (data.session) await this.resolve(data.session);
    else this.setSignedOut();
  }

  // ---- Email code -----------------------------------------------------------

  async sendCode(email: string): Promise<void> {
    const supabase = this.client();
    if (!supabase || this.busy) return;
    this.busy = true;
    this.error = null;
    try {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) this.error = friendlyError(error);
      else this.codeSentTo = email;
    } catch (err) {
      this.error = friendlyError(err);
    } finally {
      this.busy = false;
    }
  }

  async verifyCode(code: string): Promise<void> {
    const supabase = this.client();
    if (!supabase || this.busy || !this.codeSentTo) return;
    this.busy = true;
    this.error = null;
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email: this.codeSentTo, token: code, type: 'email' });
      if (error || !data.session) {
        this.error = friendlyError(error);
        return;
      }
      await this.resolve(data.session);
      this.codeSentTo = null;
    } catch (err) {
      this.error = friendlyError(err);
    } finally {
      this.busy = false;
    }
  }

  /** Back to the email step (wrong address, or start over). */
  changeEmail(): void {
    this.codeSentTo = null;
    this.error = null;
  }

  // ---- Claim ----------------------------------------------------------------

  async loadRoster(): Promise<RosterEntry[]> {
    const supabase = this.client();
    if (!supabase) return [];
    const { data, error } = await supabase.rpc('claimable_players');
    if (error) throw new Error(friendlyError(error));
    return (data ?? []).map((r) => ({ id: r.id, name: r.display_name, team: r.team_name ?? null }));
  }

  /** Link this account to a player. Final: only an admin can change it after. */
  async claim(playerId: string): Promise<void> {
    const supabase = this.client();
    if (!supabase || this.busy) return;
    this.busy = true;
    this.error = null;
    try {
      const { error } = await supabase.rpc('claim_player', { p_player_id: playerId });
      if (error) {
        this.error = /already linked|can't be claimed/.test(error.message)
          ? 'That player was just claimed by another account. Pick again, or ask a league admin.'
          : friendlyError(error);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) await this.resolve(data.session);
    } catch (err) {
      this.error = friendlyError(err);
    } finally {
      this.busy = false;
    }
  }

  // ---- Sign out -------------------------------------------------------------

  async signOut(): Promise<void> {
    const supabase = this.client();
    if (!supabase) return;
    // Revokes the session server-side when online; offline, at least forget
    // it on this device.
    const { error } = await supabase.auth.signOut();
    if (error) await supabase.auth.signOut({ scope: 'local' });
    this.setSignedOut();
  }
}

export const accountState = new AccountState();
