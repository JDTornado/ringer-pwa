<script lang="ts">
  import { accountState as acct } from '../state/account.svelte';

  let open = $state(false);
  let confirming = $state(false);
  let root = $state<HTMLElement | null>(null);

  const initials = $derived(
    (acct.account?.playerName ?? '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join(''),
  );

  function toggle() {
    open = !open;
    confirming = false;
  }

  // A tap anywhere outside the menu closes it. composedPath(), not
  // contains(): a tap on "Sign out" swaps that button out of the DOM before
  // this runs, so the target is no longer inside the menu.
  function onWindowClick(e: MouseEvent) {
    if (open && root && !e.composedPath().includes(root)) open = false;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false;
  }
</script>

<svelte:window onkeydown={onKey} onclick={onWindowClick} />

{#if acct.account}
  <div class="account" bind:this={root}>
    <button
      class="avatar"
      onclick={toggle}
      aria-haspopup="true"
      aria-expanded={open}
      aria-label="Account: {acct.account.playerName}"
    >
      {initials}
    </button>

    {#if open}
      <div class="menu card" role="menu" aria-label="Account">
        <div class="who">
          <div class="name" data-testid="account-player">{acct.account.playerName}</div>
          <div class="email" data-testid="account-email">{acct.account.email}</div>
          {#if acct.offline}<div class="offline">Offline · using this device's saved sign-in</div>{/if}
        </div>
        {#if confirming}
          <div class="note">You'll need a new email code to sign in again.</div>
          <button class="btn btn-secondary danger" role="menuitem" onclick={() => acct.signOut()}>Yes, sign out</button>
          <button class="btn btn-secondary" role="menuitem" onclick={() => (confirming = false)}>Cancel</button>
        {:else}
          <button class="btn btn-secondary" role="menuitem" onclick={() => (confirming = true)}>Sign out</button>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .account {
    position: relative;
  }
  .avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 0;
    background: var(--team-a);
    color: var(--on-team);
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 16px;
    cursor: pointer;
  }
  .menu {
    position: absolute;
    right: 0;
    top: 50px;
    z-index: 10;
    width: 260px;
    max-width: calc(100vw - 48px);
    background: var(--color-card);
    box-shadow: var(--shadow-md);
    padding: 12px;
    gap: 8px;
  }
  .who {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-bottom: 4px;
  }
  .name {
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 18px;
  }
  .email,
  .note {
    font-size: 13px;
    opacity: 0.7;
    overflow-wrap: anywhere;
  }
  .offline {
    font-size: 12px;
    color: var(--editing-text);
  }
  .danger {
    color: var(--danger);
  }
</style>
