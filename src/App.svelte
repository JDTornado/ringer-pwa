<script lang="ts">
  import { onMount } from 'svelte';
  import ReviewOverlay from './components/ReviewOverlay.svelte';
  import UpdateBanner from './components/UpdateBanner.svelte';
  import ClaimPlayer from './screens/ClaimPlayer.svelte';
  import GameOver from './screens/GameOver.svelte';
  import Scoring from './screens/Scoring.svelte';
  import Setup from './screens/Setup.svelte';
  import SignIn from './screens/SignIn.svelte';
  import { accountState as acct } from './state/account.svelte';
  import { gameState as gs } from './state/game.svelte';
  import { updateState } from './state/update.svelte';

  // Scoring is gated: the game screens only render for a signed-in account
  // linked to a player ('ready'), including offline from the saved sign-in.
  const screen = $derived(acct.status !== 'ready' ? acct.status : gs.loaded ? gs.screen : 'loading');

  onMount(() => {
    void acct.init();
    // Resume a saved in-progress (or finished) game, if there is one.
    void gs.init();
    // Register the service worker; new deploys wait for the banner's Reload.
    updateState.start();
  });
</script>

<main class="page">
  <div class="sheet" data-screen={screen}>
    {#if updateState.available}
      <UpdateBanner blocker={gs.reloadBlocker} onReload={() => updateState.reload()} />
    {/if}
    {#if acct.status === 'signedOut'}
      <SignIn />
    {:else if acct.status === 'unlinked'}
      <ClaimPlayer />
    {:else if acct.status === 'unconfigured'}
      <div class="notice">
        <h1>Sign-in isn't set up</h1>
        <p>This build of Ringer isn't connected to the league server, so nobody can sign in to keep score.</p>
      </div>
    {:else if acct.status === 'unreachable'}
      <div class="notice">
        <h1>Can't reach the server</h1>
        <p>You're signed in, but Ringer needs a connection once to load your player. Check your signal and try again.</p>
        <button class="btn btn-primary" onclick={() => acct.retry()}>Try again</button>
        <button class="btn btn-ghost" onclick={() => acct.signOut()}>Sign out</button>
      </div>
    {:else if acct.status === 'ready' && gs.loaded}
      {#if gs.screen === 'setup'}
        <Setup />
      {:else if gs.screen === 'scoring'}
        <Scoring />
      {:else}
        <GameOver />
      {/if}
    {/if}
  </div>

  {#if acct.status === 'ready' && gs.reviewOpen && gs.game}
    <ReviewOverlay
      teamAName={gs.game.teamAName}
      teamBName={gs.game.teamBName}
      totalA={gs.totals.a}
      totalB={gs.totals.b}
      rows={gs.review}
      confirmingAbandon={gs.confirmingAbandon}
      onClose={() => gs.closeReview()}
      onEdit={(id) => gs.startEdit(id)}
      onAskAbandon={() => (gs.confirmingAbandon = true)}
      onCancelAbandon={() => (gs.confirmingAbandon = false)}
      onAbandon={() => gs.abandon()}
    />
  {/if}
</main>

<style>
  .notice {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .notice h1 {
    font-size: 22px;
    font-weight: 700;
  }
  .notice p {
    margin: 0;
    font-size: 14px;
    opacity: 0.75;
  }
</style>
