# Ringer — Reno Horseshoe League scoring PWA

Installable web app for scoring league horseshoe games: game setup → live scoring →
game over, then (later) league data, stats, and standings on Supabase.

This repo is also a **pilot** for moving our office's mobile apps off FlutterFlow.
When something is harder than it should be — a workaround, a tool fighting you, an
iOS/Safari surprise, a deploy snag — add one dated line to `docs/pilot-notes.md`.

## How we work

- Josh approves before anything big: new dependencies, schema changes, structural
  refactors, deploys. For multi-file or ambiguous work, **post a short plan and wait**.
- One step at a time. Do the step asked for; list follow-ups instead of doing them.
- Never push to the git remote or the hosted Supabase project without explicit
  approval. Local commits on a branch are fine once a step is verified.
- If the docs disagree with each other or with the code, **stop and ask**. Don't
  pick one silently.

## Source of truth

| What | Where | Notes |
|---|---|---|
| Domain rules | `docs/data-model.md` | Frame model, ringer validation table, win rules, stats math, color tokens. Authoritative for **rules and meaning**. Its field names are conceptual; **storage shape** lives in the migrations. |
| Schema workflow | `docs/database.md` | Migrations, local Supabase, approval gate. Follow it exactly. |
| Schema | `supabase/migrations/` | Starts with `*_initial_schema.sql`. Constraints are tested in `supabase/tests/` (pgTAP). Not on the hosted project until Josh approves a push. |
| Look and behavior | `docs/design/prototype/New Game Setup.dc.html` | The canonical reference for setup → scoring → game over. Match its **rendered** look and interactions. |

Ignore in the prototype folder:
- `Horseshoe Scorekeeper.dc.html`: an older variant.
- `_ds/industry-*/readme.md` and its "blueprint" direction (square corners, corner
  marks, duotone). The prototype pulls base variables from `_ds/.../styles.css`
  (Barlow / Barlow Condensed, neutral ramp, shadows); copy the values the prototype
  actually uses into our tokens file. Don't link the `_ds` stylesheet or bundle.
- `support.js` and the `<x-dc>`, `<sc-if>`, `{{ }}` syntax are the prototype tool's
  runtime. Read them for behavior; don't port them.

## Stack

- **Vite + TypeScript (strict)**, **Svelte 5**: plain Vite app, not SvelteKit.
  - Use runes only (`$state`, `$derived`, `$effect`, `$props`). **No Svelte 4
    syntax:** no `export let`, no `$:` reactive statements, no `createEventDispatcher`,
    and use `onclick`, not `on:click`.
  - Shared reactive state lives in `.svelte.ts` modules.
- **vite-plugin-pwa** for the manifest and service worker.
- **IndexedDB** (via `idb-keyval` or `idb`) for the in-progress game draft.
- **supabase-js** for the backend, added in a later phase. Until then, no network
  calls.
- **Vitest** for domain logic and **Playwright** for browser verification.
- npm. Dev machine is Windows; local Supabase needs Docker Desktop.
- Hosting: free static host (Cloudflare Pages or Netlify), not chosen yet.

## Folder structure

```
src/
  main.ts, App.svelte        # App.svelte switches screens: setup | scoring | gameOver
  styles/tokens.css          # ALL colors/fonts/radii/shadows as CSS custom properties
  styles/base.css
  domain/                    # pure TS — no Svelte, DOM, or storage imports
    types.ts                 # Game, Frame, Participant, Rules (endCondition)
    ringerRules.ts           # the ringer validation TABLE + one pure validate/options fn
    derive.ts                # running totals, game-end check, per-player stats
    *.test.ts
  state/
    game.svelte.ts           # current game: frames are the only stored scoring data
    draft.ts                 # IndexedDB save/restore of the in-progress game
  screens/                   # Setup.svelte, Scoring.svelte, GameOver.svelte
  components/
  lib/                       # supabase client + database.types.ts (later)
public/                      # icons incl. apple-touch-icon
supabase/                    # config.toml, migrations/, seed.sql
tests/e2e/                   # Playwright
docs/
```

## Domain rules that shape the code (details in data-model.md)

- **Frames are the source of truth.** A frame is one end's throw. There are 2 per
  inning, and **south always goes first**. Store only frames. Totals, the current
  inning, game-over, live/dead ringers, and ringer % are always **derived** and never
  stored or typed in by the user.
- The app records the players' **verdict**: which team scored (or nobody), points
  from 1 to 6, and each thrower's ringer count from 0 to 2. There is no shoe-by-shoe
  log and no cancellation math.
- **5 points is never valid.** Ringer options are driven by the data table in
  `ringerRules.ts`, one pure function used by both the UI and validation, with no
  hand-written if-chains.
- Dead ringers = min of the two throwers' counts. Ringer % = total ringers ÷ shoes
  thrown.
- Win rules: first team to 21 or more wins. If neither does, the higher score at
  15 innings (30 shoes per player) wins. A tie at that point is resolved by the
  `tieAtLimit` rule.
- **Open league decisions. Don't design around a guess:**
  - **Tie rule:** implement the tie behavior as a value in the game's rules
    snapshot. `suddenDeath` is the current default, so swapping it out should be a
    config change, not a rewrite.
  - **Sub/rover stat attribution:** record capacity and who a player played for,
    but don't build attribution logic or standings until the league decides.
- Zero-point frames display as `—` by default; `0` is a display toggle, not data.

## Styling

- Every color comes from a token in `src/styles/tokens.css`: `--team-a #053961`,
  `--team-b #7C3C0F`, `--action #0867C4`, `--action-alt #2E7AC8`, plus `--editing`,
  `--final-inning`, `--extra-innings`, and the neutrals/fonts copied from the
  prototype. Don't put raw hex values in components.
- Design for a phone first, at a 390px-wide viewport. Tap targets are at least
  44px. Text inputs use at least 16px font, otherwise iOS zooms the page on focus.

## iOS / PWA gotchas

- iOS ignores `beforeinstallprompt`, so installing is a manual Share → Add to Home
  Screen. It also needs an `apple-touch-icon` and the
  `apple-mobile-web-app-*` meta tags.
- Use `100dvh` and `env(safe-area-inset-*)` instead of `100vh`, for the notch and
  home indicator.
- Safari can evict site storage after about 7 days of no use in a browser tab.
  Installed home-screen apps keep theirs, but their storage is separate from
  Safari's. Call `navigator.storage.persist()`, and never treat the IndexedDB draft
  as the permanent record.
- The service worker doesn't run under `vite dev`. Test anything PWA-related with
  `npm run build && npm run preview`.
- Playwright's WebKit browser approximates Safari, but it isn't iOS. Real-device
  checks are Josh's job, so list them in your report.

## Definition of done

"It compiles" is not done. A step is done when **all** of these hold:

1. `npm run check` (svelte-check + tsc) and `npm run build` pass with no errors.
2. `npm test` passes, and new domain logic has unit tests (the ringer table and
   derivations especially).
3. **It runs in a browser.** Exercise the feature in a real browser at a 390×844
   viewport, using Playwright (Chromium **and** WebKit) or the browser tool: click
   through the actual flow, confirm what it shows, and check that **the console has
   zero errors**. Include screenshots or a short description of what you saw.
4. You report what you verified, what you couldn't (e.g., real iPhone, install
   flow), and any docs you changed.

## Commands

```
npm run dev          # local dev server
npm run build        # production build (includes SW)
npm run preview      # serve the build — use for PWA/offline testing
npm run check        # svelte-check (src) + tsc -p tsconfig.node.json (configs, e2e)
npm test             # vitest (src/**/*.test.ts)
npm run test:e2e     # playwright, Chromium + WebKit at 390x844; builds and serves
                     #   the production bundle itself (port 4173), so SW is real
npm run icons        # regenerate public/ icons from scripts/gen-icons.mjs
node scripts/capture-3b.mjs  # after a build: prototype vs app screenshots into
                     #   review/3b/ (gitignored; needs network for the prototype)
npm run db:start     # local Supabase (Docker Desktop must be running)
npm run db:reset     # rebuild local DB from migrations + seed.sql
npm run db:test      # pgTAP tests in supabase/tests/
npm run db:types     # regenerate src/lib/database.types.ts from the local DB
npx supabase ...     # see docs/database.md
```

TypeScript is pinned to 6.x: svelte-check doesn't support TypeScript 7 yet.
