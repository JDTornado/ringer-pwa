<script lang="ts">
  let { onReview }: { onReview: () => void } = $props();
</script>

<div class="header">
  <div class="title">Horseshoe Scoring</div>
  <button class="btn review" onclick={onReview}>
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="17"></rect>
      <line x1="7" y1="10" x2="17" y2="10"></line>
      <line x1="7" y1="14" x2="17" y2="14"></line>
      <line x1="7" y1="18" x2="13" y2="18"></line>
    </svg>
    Review
  </button>
</div>

<style>
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .title {
    font-family: var(--font-heading);
    font-size: 13px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-accent-600);
  }
</style>
