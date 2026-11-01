<script lang="ts">
  import { onMount } from 'svelte';
  import ReviewOverlay from './components/ReviewOverlay.svelte';
  import GameOver from './screens/GameOver.svelte';
  import Scoring from './screens/Scoring.svelte';
  import Setup from './screens/Setup.svelte';
  import { gameState as gs } from './state/game.svelte';

  // Resume a saved in-progress (or finished) game, if there is one.
  onMount(() => {
    void gs.init();
  });
</script>

<main class="page">
  <div class="sheet" data-screen={gs.loaded ? gs.screen : 'loading'}>
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
