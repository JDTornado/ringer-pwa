<script lang="ts">
  import { onMount } from 'svelte';
  import { accountState as acct } from '../state/account.svelte';
  import { searchRoster, type RosterEntry } from '../lib/signin';

  let roster = $state<RosterEntry[] | null>(null);
  let loadError = $state<string | null>(null);
  let query = $state('');
  /** The player tapped, waiting for "Yes, that's me". */
  let picked = $state<RosterEntry | null>(null);

  const matches = $derived(roster ? searchRoster(roster, query) : []);

  async function load() {
    loadError = null;
    try {
      roster = await acct.loadRoster();
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }
  }

  onMount(() => {
    void load();
  });

  async function confirm() {
    if (!picked) return;
    await acct.claim(picked.id);
    if (acct.error) {
      // Someone else may have claimed them meanwhile: refresh the list.
      picked = null;
      void load();
    }
  }
</script>

<div class="claim">
  <div>
    <div class="signed">Signed in as {acct.email}</div>
    <h1>Which player are you?</h1>
    <div class="sub">Pick your name from the league roster. This links your account to your stats.</div>
  </div>

  {#if picked}
    <div class="card panel confirm" role="dialog" aria-label="Confirm your player">
      <div class="big">{picked.name}</div>
      {#if picked.team}<div class="team">{picked.team}</div>{/if}
      <div class="warn">
        Once you confirm, only a league admin can change this. Make sure it's you.
      </div>
      <button class="btn btn-primary" onclick={confirm} disabled={acct.busy}>
        {acct.busy ? 'Linking…' : "Yes, that's me"}
      </button>
      <button class="btn btn-secondary" onclick={() => (picked = null)} disabled={acct.busy}>Back to the list</button>
    </div>
  {:else}
    <input
      class="search"
      type="search"
      bind:value={query}
      placeholder="Search by name or team"
      aria-label="Search players"
      autocomplete="off"
      autocapitalize="words"
      spellcheck="false"
    />

    {#if loadError}
      <div class="error" role="alert">{loadError}</div>
      <button class="btn btn-secondary" onclick={load}>Try again</button>
    {:else if roster === null}
      <div class="empty">Loading the roster…</div>
    {:else if matches.length === 0}
      <div class="empty">
        {roster.length === 0 ? 'No players are waiting to be claimed.' : 'No players match that search.'}
        Not on the list? Ask a league admin to add you.
      </div>
    {:else}
      <ul class="list" aria-label="Players">
        {#each matches as p (p.id)}
          <li>
            <button class="row" onclick={() => (picked = p)}>
              <span class="name">{p.name}</span>
              <span class="team">{p.team ?? 'No team'}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}

  {#if acct.error}
    <div class="error" role="alert">{acct.error}</div>
  {/if}

  <button class="btn btn-ghost signout" onclick={() => acct.signOut()}>Not you? Sign out</button>
</div>

<style>
  .claim {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .signed {
    font-size: 12px;
    color: var(--color-accent);
    overflow-wrap: anywhere;
  }
  h1 {
    line-height: inherit;
    font-size: 22px;
    font-weight: 700;
  }
  .sub {
    font-size: 12px;
    opacity: 0.65;
  }
  .search {
    width: 100%;
    padding: 11px 12px;
    color: var(--color-text);
    background: var(--color-card);
    border: 1px solid var(--color-divider);
    border-radius: 8px;
  }
  .search::placeholder {
    color: var(--color-neutral-500);
    opacity: 1;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    background: var(--color-card);
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }
  .list li + li {
    border-top: 1px solid var(--color-divider);
  }
  .row {
    width: 100%;
    min-height: 52px;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    text-align: left;
    background: transparent;
    border: 0;
    cursor: pointer;
  }
  .row:active {
    background: var(--color-neutral-100);
  }
  .name,
  .big {
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 17px;
  }
  .big {
    font-size: 24px;
  }
  .team {
    font-size: 12px;
    opacity: 0.6;
  }
  .panel {
    background: var(--color-card);
    padding: 14px;
    gap: 10px;
  }
  .warn {
    font-size: 13px;
    padding: 8px 10px;
    border-radius: var(--radius-md);
    background: var(--editing-bg);
    color: var(--editing-text);
    border: 1px solid var(--editing);
  }
  .empty {
    font-size: 14px;
    opacity: 0.7;
    padding: 4px 2px;
  }
  .error {
    font-size: 14px;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    color: var(--danger);
    background: var(--extra-innings-bg);
    border: 1px solid var(--extra-innings-border);
  }
  .signout {
    align-self: center;
  }
</style>
