<script lang="ts">
  // Slim "new version" banner. Reload is offered only when it can't lose
  // input: typed setup fields, or a half-entered or half-edited frame.
  interface Props {
    /** What a reload would lose; null = safe to reload. */
    blocker: 'setup' | 'frame' | null;
    onReload: () => void;
  }
  let { blocker, onReload }: Props = $props();

  const HINTS = { setup: 'Finish setup first', frame: 'Finish this frame first' } as const;
</script>

<div class="update" role="status" data-testid="update-banner">
  <div class="text">
    <strong>Update available</strong>
    {#if blocker !== null}
      <span class="hint" data-testid="update-hint">{HINTS[blocker]}</span>
    {/if}
  </div>
  <button class="btn reload" disabled={blocker !== null} onclick={onReload}>Reload</button>
</div>

<style>
  .update {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin: 14px 14px 0;
    padding: 4px 4px 4px 12px;
    background: var(--color-accent-100);
    border: 1px solid var(--color-accent-300);
    border-radius: var(--radius-md);
    font-size: 13px;
  }
  .text {
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }
  strong {
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 14px;
    color: var(--color-accent-700);
  }
  .hint {
    font-size: 12px;
    color: var(--color-neutral-600);
  }
  .reload {
    flex: none;
    background: var(--action);
    border-color: var(--action);
    color: var(--on-action);
    padding-inline: 16px;
  }
</style>
