<script lang="ts">
  // The prototype's horseshoe glyph: a dot for a live ringer, an X for dead.
  interface Props {
    kind: 'live' | 'dead';
    size?: number;
  }
  let { kind, size = 18 }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="3"
  stroke-linecap="round"
  aria-hidden="true"
>
  <path d="M6 5v7a6 6 0 0 0 12 0V5"></path>
  {#if kind === 'live'}
    <circle cx="12" cy="9" r="2.2" fill="currentColor" stroke="none"></circle>
  {:else}
    <path d="M9 6l6 6M15 6l-6 6"></path>
  {/if}
</svg>
