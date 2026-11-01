<script lang="ts">
  import type { PlayerStats } from '../domain/derive';
  import type { Side } from '../domain/types';
  import RingerIcon from './RingerIcon.svelte';

  interface Props {
    teamAName: string;
    teamBName: string;
    totalA: number;
    totalB: number;
    players: PlayerStats[];
    /** Side that just scored: its total pulses. */
    pulse: Side | null;
  }
  let { teamAName, teamBName, totalA, totalB, players, pulse }: Props = $props();

  const sides = $derived([
    { side: 'a' as const, name: teamAName, total: totalA },
    { side: 'b' as const, name: teamBName, total: totalB },
  ]);
</script>

<div class="bar">
  {#each sides as s (s.side)}
    <section class="panel side-{s.side}" aria-label="{s.name} score">
      <div class="name">{s.name}</div>
      <div class="total" class:pulse={pulse === s.side} data-testid="score-{s.side}">{s.total}</div>
      <div class="players">
        {#each players.filter((p) => p.side === s.side) as p (p.participantId)}
          <div class="player" data-testid="player-{p.participantId}">
            <span class="pname">{p.name}</span>
            <span class="pts">{p.points}</span>
            <span class="live"><RingerIcon kind="live" /></span>
            <span aria-label="live ringers">{p.live}</span>
            <span class="dead"><RingerIcon kind="dead" /></span>
            <span aria-label="dead ringers">{p.dead}</span>
          </div>
        {/each}
      </div>
    </section>
  {/each}
</div>

<style>
  .bar {
    display: flex;
    overflow: hidden;
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-divider);
  }
  .panel {
    flex: 1;
    min-width: 0;
    color: var(--on-team);
    padding: 14px 14px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .side-a {
    background: var(--team-a);
  }
  .side-b {
    background: var(--team-b);
    align-items: flex-end;
  }
  .name {
    font-family: var(--font-heading);
    font-size: 12px;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    opacity: 0.85;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .total {
    font-family: var(--font-heading);
    font-size: 54px;
    line-height: 1;
    font-weight: 600;
    display: inline-block;
    transform: scale(1);
    transition: transform 150ms ease;
    transform-origin: left center;
  }
  .side-b .total {
    transform-origin: right center;
  }
  .total.pulse {
    transform: scale(1.16);
  }
  .players {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-top: 2px;
    font-size: 12px;
  }
  .side-b .players {
    align-items: flex-end;
  }
  .player {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .side-b .player {
    flex-direction: row-reverse;
  }
  .pname {
    width: 40px;
    flex: none;
    font-family: var(--font-heading);
    font-weight: 600;
    opacity: 0.95;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .side-b .pname {
    text-align: right;
  }
  .pts {
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 14px;
    min-width: 14px;
  }
  .side-b .pts {
    text-align: right;
  }
  .live {
    color: var(--ringer-live);
    display: flex;
  }
  .dead {
    color: var(--ringer-dead);
    display: flex;
  }
</style>
