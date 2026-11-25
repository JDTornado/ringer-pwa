<script lang="ts">
  import { accountState as acct } from '../state/account.svelte';
  import { CODE_LENGTH, cleanCode, normalizeEmail } from '../lib/signin';

  let emailInput = $state('');
  let code = $state('');
  const email = $derived(normalizeEmail(emailInput));
  let codeEl = $state<HTMLInputElement | null>(null);

  // Focus the code box when the code step appears.
  $effect(() => {
    if (acct.codeSentTo && codeEl) codeEl.focus();
  });

  function submitEmail(e: SubmitEvent) {
    e.preventDefault();
    if (email) void acct.sendCode(email);
  }

  function onCodeInput() {
    code = cleanCode(code);
    // A full code (typed, pasted, or autofilled from Mail) submits itself.
    if (code.length === CODE_LENGTH) void verify();
  }

  async function verify(e?: SubmitEvent) {
    e?.preventDefault();
    if (code.length !== CODE_LENGTH) return;
    await acct.verifyCode(code);
    if (acct.error) code = '';
  }

  function resend() {
    if (acct.codeSentTo) {
      code = '';
      void acct.sendCode(acct.codeSentTo);
    }
  }

  function useDifferentEmail() {
    code = '';
    acct.changeEmail();
  }
</script>

<div class="signin">
  <div>
    <div class="kicker">Reno Horseshoe League</div>
    <h1>Sign in to Ringer</h1>
    <div class="sub">Sign in once on this device to keep score.</div>
  </div>

  {#if acct.codeSentTo === null}
    <!-- Other sign-in methods (e.g. a Google button) go above this form. -->
    <form class="card panel" onsubmit={submitEmail}>
      <label class="field">
        <span class="label">Email</span>
        <input
          type="email"
          bind:value={emailInput}
          placeholder="you@example.com"
          autocomplete="email"
          inputmode="email"
          autocapitalize="off"
          spellcheck="false"
          aria-label="Email"
        />
      </label>
      <button class="btn btn-primary" type="submit" disabled={!email || acct.busy}>
        {acct.busy ? 'Sending…' : 'Email me a code'}
      </button>
      <div class="hint">We'll email you a 6-digit code. No password needed.</div>
    </form>
  {:else}
    <form class="card panel" onsubmit={verify}>
      <div class="sent">
        Enter the 6-digit code we sent to <strong data-testid="code-email">{acct.codeSentTo}</strong>.
      </div>
      <label class="field">
        <span class="label">Code</span>
        <input
          class="code"
          bind:this={codeEl}
          bind:value={code}
          oninput={onCodeInput}
          placeholder="••••••"
          autocomplete="one-time-code"
          inputmode="numeric"
          pattern="[0-9]*"
          maxlength="7"
          aria-label="6-digit code"
          disabled={acct.busy}
        />
      </label>
      <button class="btn btn-primary" type="submit" disabled={code.length !== CODE_LENGTH || acct.busy}>
        {acct.busy ? 'Checking…' : 'Sign in'}
      </button>
      <div class="row">
        <button class="btn btn-ghost" type="button" onclick={resend} disabled={acct.busy}>Send a new code</button>
        <button class="btn btn-ghost" type="button" onclick={useDifferentEmail} disabled={acct.busy}>
          Use a different email
        </button>
      </div>
    </form>
  {/if}

  {#if acct.error}
    <div class="error" role="alert">{acct.error}</div>
  {/if}
</div>

<style>
  .signin {
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
  .sub,
  .hint {
    font-size: 12px;
    opacity: 0.65;
  }
  .panel {
    background: var(--color-card);
    padding: 12px;
    gap: 10px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  input {
    width: 100%;
    padding: 11px 12px;
    color: var(--color-text);
    background: var(--color-card);
    border: 1px solid var(--color-divider);
    border-radius: 8px;
  }
  input::placeholder {
    color: var(--color-neutral-500);
    opacity: 1;
  }
  .code {
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 26px;
    letter-spacing: 0.3em;
    text-align: center;
  }
  .sent {
    font-size: 14px;
    overflow-wrap: anywhere;
  }
  .row {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
  }
  .error {
    font-size: 14px;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    color: var(--danger);
    background: var(--extra-innings-bg);
    border: 1px solid var(--extra-innings-border);
  }
</style>
