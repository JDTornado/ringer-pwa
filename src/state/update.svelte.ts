// Service worker updates: PROMPT, never auto-reload.
//
// A new deploy installs in the background and waits. `available` turns true
// and the update banner offers Reload. Reloading is only offered when it
// can't lose input (see gameState.canReloadSafely): confirmed frames are
// already in the IndexedDB draft, so the game resumes after the reload.
//
// Uses the plain `virtual:pwa-register` helper wrapped in runes. The plugin's
// Svelte variant returns svelte/store writables, which would need adapting
// for runes anyway.

import { registerSW } from 'virtual:pwa-register';

const HOURLY = 60 * 60 * 1000;

class UpdateState {
  /** A new version is installed and waiting for Reload. */
  available = $state(false);

  private applyUpdate: ((reloadPage?: boolean) => Promise<void>) | undefined;
  private registration: ServiceWorkerRegistration | undefined;
  private started = false;

  start(): void {
    if (this.started || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    this.started = true;
    this.applyUpdate = registerSW({
      immediate: true,
      onNeedRefresh: () => {
        this.available = true;
      },
      onRegisteredSW: (_url, registration) => {
        this.registration = registration;
        // Look for a new deploy when the app returns to the foreground, and
        // hourly while it stays open. (sw.js is served no-cache.)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void this.check();
        });
        setInterval(() => void this.check(), HOURLY);
      },
    });
  }

  /** Ask the browser to re-fetch sw.js. Quietly does nothing offline. */
  async check(): Promise<void> {
    const reg = this.registration;
    if (!reg || reg.installing || !navigator.onLine) return;
    try {
      await reg.update();
    } catch {
      // Offline or the server is unreachable: try again next time.
    }
  }

  /** Activate the waiting version; the page reloads once it takes control. */
  reload(): void {
    // Reload ourselves on controllerchange. The helper only reloads when
    // workbox flags the change as an update it started; one found by our own
    // check() is "external", and the page would just sit on the old version.
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
    void this.applyUpdate?.(true);
  }
}

export const updateState = new UpdateState();
