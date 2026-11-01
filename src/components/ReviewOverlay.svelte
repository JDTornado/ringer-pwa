<script lang="ts">
  import type { ReviewRow } from '../domain/derive';

  interface Props {
    teamAName: string;
    teamBName: string;
    totalA: number;
    totalB: number;
    /** Newest first. */
    rows: ReviewRow[];
    confirmingAbandon: boolean;
    onClose: () => void;
    onEdit: (frameId: string) => void;
    onAskAbandon: () => void;
    onCancelAbandon: () => void;
    onAbandon: () => void;
  }
  let {
    teamAName,
    teamBName,
    totalA,
    totalB,
    rows,
    confirmingAbandon,
    onClose,
    onEdit,
    onAskAbandon,
    onCancelAbandon,
    onAbandon,
  }: Props = $props();

  let dialog: HTMLDivElement | undefined = $state();
  $effect(() => {
    dialog?.focus();
  });

  const endLabel = (end: string) => (end === 'south' ? 'South' : 'North');
  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="backdrop" role="presentation" onclick={onClose}>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="review-title"
    tabindex="-1"
    bind:this={dialog}
    onclick={(e) => e.stopPropagation()}
    onkeydown={() => {}}
  >
    <div class="head">
      <h2 id="review-title">Review</h2>
      <button class="btn close" aria-label="Close review" onclick={onClose}>✕</button>
    </div>
    <div class="tags">
      <span class="tag tag-a">{teamAName}: {totalA}</span>
      <span class="tag tag-b">{teamBName}: {totalB}</span>
    </div>

    <div class="list">
      {#each rows as row (row.frameId)}
        <button class="row" data-testid="review-row" onclick={() => onEdit(row.frameId)}>
          <span class="meta">
            <span>Inn {row.inning} · {endLabel(row.end)}</span>
            <span>{row.cumA}–{row.cumB}</span>
          </span>
          <span class="result result-{row.scoringSide ?? 'none'}">{row.resultLabel}</span>
          <span class="detail">{row.detail}</span>
        </button>
      {:else}
        <p class="empty">No frames yet.</p>
      {/each}

      <div class="abandon">
        {#if confirmingAbandon}
          <p class="warn" role="alert">
            Abandon this game? Its frames are deleted from this device and can't be recovered.
          </p>
          <div class="actions">
            <button class="btn" onclick={onCancelAbandon}>Keep playing</button>
            <button class="btn danger" onclick={onAbandon}>Abandon</button>
          </div>
        {:else}
          <button class="btn ghost-danger" onclick={onAskAbandon}>Abandon game</button>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 13.6px;
    background: color-mix(in srgb, var(--color-neutral-900) 50%, transparent);
    z-index: 10;
  }
  .dialog {
    width: 358px;
    max-width: 100%;
    max-height: 82dvh;
    display: flex;
    flex-direction: column;
    gap: 10.2px;
    padding: 13.6px;
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-lg);
    background: var(--color-bg);
    box-shadow: var(--shadow-lg);
    outline: none;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h2 {
    font-size: 20px;
  }
  .close {
    width: 44px;
    padding: 0;
  }
  .tags {
    display: flex;
    gap: 8px;
  }
  .tag {
    flex: 1;
    display: inline-flex;
    justify-content: center;
    padding: 8px;
    font-size: 11px;
    letter-spacing: 0.02em;
    border-radius: var(--radius-md);
  }
  .tag-a {
    color: var(--team-a);
    background: color-mix(in srgb, var(--team-a) 12%, transparent);
  }
  .tag-b {
    color: var(--team-b);
    background: color-mix(in srgb, var(--team-b) 12%, transparent);
  }
  .list {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    text-align: left;
    gap: 0;
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-md);
    padding: 10px;
    background: transparent;
    cursor: pointer;
    flex: none;
  }
  .meta {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    opacity: 0.6;
  }
  .result {
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 15px;
  }
  .result-a {
    color: var(--team-a);
  }
  .result-b {
    color: var(--team-b);
  }
  .detail {
    font-size: 12px;
    opacity: 0.75;
  }
  .empty {
    margin: 0;
    font-size: 13px;
    opacity: 0.6;
  }
  .abandon {
    margin-top: 6px;
    padding-top: 10px;
    border-top: 1px solid var(--color-divider);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ghost-danger {
    border-color: transparent;
    color: var(--danger);
  }
  .warn {
    margin: 0;
    font-size: 13px;
    color: var(--danger);
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .actions .btn {
    flex: 1;
  }
  .danger {
    background: var(--danger);
    border-color: var(--danger);
    color: var(--on-team);
  }
</style>
