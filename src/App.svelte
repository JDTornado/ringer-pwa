<script lang="ts">
  // Placeholder shell. Screens (setup | scoring | gameOver) arrive in 3b.
  const swatches = [
    { label: 'Team A', token: '--team-a' },
    { label: 'Team B', token: '--team-b' },
  ];
</script>

<main>
  <h1>Ringer</h1>
  <p class="tagline">Reno Horseshoe League scoring</p>
  <div class="swatches">
    {#each swatches as s (s.token)}
      <div class="swatch" style:background={`var(${s.token})`} data-token={s.token}>
        {s.label}
      </div>
    {/each}
  </div>
</main>

<style>
  main {
    min-height: 100dvh;
    padding: 32px 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    background: var(--color-bg);
  }
  h1 {
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 48px;
    letter-spacing: 0.02em;
    color: var(--team-a);
  }
  .tagline {
    margin: 0;
    color: var(--color-neutral-600);
  }
  .swatches {
    display: flex;
    gap: 12px;
    width: 100%;
    max-width: 358px;
    margin-top: 12px;
  }
  .swatch {
    flex: 1;
    min-height: 88px;
    border-radius: var(--radius-lg);
    display: flex;
    align-items: flex-end;
    padding: 12px;
    color: var(--on-team);
    font-family: var(--font-heading);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    font-size: 13px;
    box-shadow: var(--shadow-sm);
  }
</style>
