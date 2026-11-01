<script lang="ts">
  // Slim "new version" banner. Reload is offered only when it can't lose a
  // half-entered or half-edited frame.
  interface Props {
    canReload: boolean;
    onReload: () => void;
  }
  let { canReload, onReload }: Props = $props();
</script>

<div class="update" role="status" data-testid="update-banner">
  <div class="text">
    <strong>Update available</strong>
    {#if !canReload}
      <span class="hint" data-testid="update-hint">Finish this frame first</span>
    {/if}
  </div>
  <button class="btn reload" disabled={!canReload} onclick={onReload}>Reload</button>
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
