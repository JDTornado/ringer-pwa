<script lang="ts">
  import type { PlayerStats, TeamStats } from '../domain/derive';
  import type { Side } from '../domain/types';

  interface Props {
    side: Side;
    teamName: string;
    players: PlayerStats[];
    team: TeamStats;
  }
  let { side, teamName, players, team }: Props = $props();

  // Display formatting only: derive gives an unrounded percentage.
  const pct = (p: number | null) => (p === null ? '—' : `${Math.round(p)}%`);
</script>

<div class="team-panel inset stats team-{side}" data-testid="stats-{side}">
  <div class="title">{teamName}</div>
  <table class="table">
    <thead>
      <tr><th>Player</th><th>Pts</th><th>Shoes</th><th>Live</th><th>Dead</th><th>Ring%</th></tr>
    </thead>
    <tbody>
      {#each players as p (p.participantId)}
        <tr data-testid="stats-row">
          <td>{p.name}</td><td>{p.points}</td><td>{p.shoes}</td><td>{p.live}</td><td>{p.dead}</td><td
            >{pct(p.ringerPct)}</td
          >
        </tr>
      {/each}
      <tr class="total" data-testid="stats-total">
        <td>Total</td><td>{team.points}</td><td>{team.shoes}</td><td>{team.live}</td><td>{team.dead}</td><td
          >{pct(team.ringerPct)}</td
        >
      </tr>
    </tbody>
  </table>
</div>

<style>
  .stats {
    border-radius: 8px;
    padding: 8px;
    margin-top: 10px;
  }
  .title {
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--team);
    margin-bottom: 4px;
  }
  .total {
    font-weight: 700;
    background: color-mix(in srgb, var(--team) 12%, transparent);
    border-top: 2px solid var(--team);
  }
</style>
