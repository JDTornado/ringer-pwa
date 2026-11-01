<script lang="ts">
  import { gameState } from '../state/game.svelte';

  // Local form state. Deliberate change from the prototype: no placeholder
  // defaults are filled in; Start stays disabled until all six are entered.
  let teamAName = $state('');
  let aSouth = $state('');
  let aNorth = $state('');
  let teamBName = $state('');
  let bSouth = $state('');
  let bNorth = $state('');

  const ready = $derived(
    [teamAName, aSouth, aNorth, teamBName, bSouth, bNorth].every((v) => v.trim() !== ''),
  );

  function start(e: SubmitEvent) {
    e.preventDefault();
    if (!ready) return;
    gameState.start({ teamAName, teamBName, aSouth, aNorth, bSouth, bNorth });
  }
</script>

<form class="setup" onsubmit={start}>
  <div>
    <h1>New Game</h1>
    <div class="sub">Set up two teams, two players each.</div>
  </div>

  {#each [{ side: 'a', label: 'Team A' }, { side: 'b', label: 'Team B' }] as t (t.side)}
    <fieldset class="team-panel team-card team-{t.side}">
      <legend class="team-label"><span class="dot"></span>{t.label}</legend>
      {#if t.side === 'a'}
        <input class="team-name" bind:value={teamAName} placeholder="Team name" aria-label="Team A name" autocomplete="off" />
      {:else}
        <input class="team-name" bind:value={teamBName} placeholder="Team name" aria-label="Team B name" autocomplete="off" />
      {/if}
      <div class="players">
        <label class="field">
          <span class="label">South</span>
          {#if t.side === 'a'}
            <input bind:value={aSouth} placeholder="Player name" aria-label="Team A South player" autocomplete="off" />
          {:else}
            <input bind:value={bSouth} placeholder="Player name" aria-label="Team B South player" autocomplete="off" />
          {/if}
        </label>
        <label class="field">
          <span class="label">North</span>
          {#if t.side === 'a'}
            <input bind:value={aNorth} placeholder="Player name" aria-label="Team A North player" autocomplete="off" />
          {:else}
            <input bind:value={bNorth} placeholder="Player name" aria-label="Team B North player" autocomplete="off" />
          {/if}
        </label>
      </div>
    </fieldset>
  {/each}

  <div class="note">South throws first each inning, so South players open the game.</div>

  <button class="btn btn-primary start" type="submit" disabled={!ready}>Start Game →</button>
</form>

<style>
  .setup {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  h1 {
    line-height: inherit;
    font-size: 22px;
    font-weight: 700;
  }
  .sub {
    font-size: 12px;
    opacity: 0.6;
  }
  .team-card {
    margin: 0;
    min-width: 0;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .team-label {
    /* Rendered inside the card (not on the border), as in the prototype. */
    float: left;
    width: 100%;
    padding: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--team);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--team);
    flex: none;
  }
  input {
    width: 100%;
    color: var(--color-text);
    background: var(--color-card);
    border-radius: 8px;
  }
  input::placeholder {
    color: var(--color-neutral-500);
    opacity: 1;
  }
  .team-name {
    font-family: var(--font-heading);
    font-weight: 700;
    padding: 11px 12px;
    border: 2px solid var(--team);
  }
  .players {
    display: flex;
    gap: 8px;
  }
  .field {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .field input {
    padding: 10px;
    border: 1px solid var(--color-divider);
  }
  .note {
    font-size: 12px;
    opacity: 0.65;
    padding: 0 2px;
  }
  .start {
    padding: 15px;
    font-size: 16px;
    margin-top: 4px;
  }
</style>
