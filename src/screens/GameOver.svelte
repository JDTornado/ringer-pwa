<script lang="ts">
  import GameHeader from '../components/GameHeader.svelte';
  import ProgressDots from '../components/ProgressDots.svelte';
  import ScoreBar from '../components/ScoreBar.svelte';
  import StatsTable from '../components/StatsTable.svelte';
  import { gameState as gs } from '../state/game.svelte';

  const game = $derived(gs.game);
  const winner = $derived(gs.status.winner);
  const winnerName = $derived(winner === 'a' ? game?.teamAName : game?.teamBName);
</script>

{#if game}
  <div class="over">
    <GameHeader onReview={() => gs.openReview()} />

    <ScoreBar
      teamAName={game.teamAName}
      teamBName={game.teamBName}
      totalA={gs.totals.a}
      totalB={gs.totals.b}
      players={gs.players}
      pulse={null}
    />

    <div class="card result">
      <div class="top">
        <div>
          <div class="kick">Game Over</div>
          <div class="winner side-{winner}" data-testid="winner">{winnerName} Wins</div>
        </div>
        <div class="innings">
          <div class="small">Innings Played</div>
          <div class="num" data-testid="innings-played">{gs.inningsPlayed}</div>
        </div>
      </div>

      <StatsTable
        side="a"
        teamName={game.teamAName}
        players={gs.players.filter((p) => p.side === 'a')}
        team={gs.teamA}
      />
      <StatsTable
        side="b"
        teamName={game.teamBName}
        players={gs.players.filter((p) => p.side === 'b')}
        team={gs.teamB}
      />
    </div>

    <button class="btn btn-primary" onclick={() => gs.newGame()}>New Game</button>

    <ProgressDots progress={gs.progress} />
  </div>
{/if}

<style>
  .over {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .result {
    background: var(--color-card);
    box-shadow: var(--shadow-sm);
    gap: 0;
  }
  .top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }
  .kick {
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-neutral-600);
    font-weight: 700;
  }
  .winner {
    font-family: var(--font-heading);
    font-size: 24px;
    font-weight: 600;
  }
  .side-a {
    color: var(--team-a);
  }
  .side-b {
    color: var(--team-b);
  }
  .innings {
    text-align: right;
  }
  .small {
    font-size: 11px;
    opacity: 0.6;
  }
  .num {
    font-family: var(--font-heading);
    font-size: 26px;
    font-weight: 600;
  }
</style>
