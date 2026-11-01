<script lang="ts">
  import { onMount } from 'svelte';
  import ReviewOverlay from './components/ReviewOverlay.svelte';
  import UpdateBanner from './components/UpdateBanner.svelte';
  import GameOver from './screens/GameOver.svelte';
  import Scoring from './screens/Scoring.svelte';
  import Setup from './screens/Setup.svelte';
  import { gameState as gs } from './state/game.svelte';
  import { updateState } from './state/update.svelte';

  onMount(() => {
    // Resume a saved in-progress (or finished) game, if there is one.
    void gs.init();
    // Register the service worker; new deploys wait for the banner's Reload.
    updateState.start();
  });
</script>

<main class="page">
  <div class="sheet" data-screen={gs.loaded ? gs.screen : 'loading'}>
    {#if updateState.available}
      <UpdateBanner canReload={gs.canReloadSafely} onReload={() => updateState.reload()} />
    {/if}
    {#if gs.loaded}
      {#if gs.screen === 'setup'}
        <Setup />
      {:else if gs.screen === 'scoring'}
        <Scoring />
      {:else}
        <GameOver />
      {/if}
    {/if}
  </div>

  {#if gs.reviewOpen && gs.game}
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
