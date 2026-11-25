# Project notes: gotchas and open items

Things learned the hard way, and things still open. Add a dated line when
something surprises you: a workaround, a tool fighting you, a platform quirk.
Tags: [db], [build], [deploy], [pwa], [ui], [device].

## Open items

- [device] **iOS not yet tested on a real iPhone** (Josh has Android; Android
  passed everything on 2026-11-01). To check: manual Share → Add to Home Screen,
  apple-touch-icon, standalone status bar and safe areas, storage separation
  between Safari and the home-screen app, 7-day storage eviction in a Safari
  tab, Reduce Motion.
- [ui] Ringer buttons are disabled until a side is picked; the prototype let
  ringers be entered first. Revisit if scorekeepers want ringers-first.
- [build] `npm audit` reports moderate advisories in build-time deps
  (workbox-build → deepmerge/glob, via vite-plugin-pwa). Nothing ships to the
  browser; re-check before a wider release.

## Gotchas

- [build] 2026-11-24: Don't start Docker Desktop from Claude's sandboxed shell.
  It created `AppData\Local\Docker\run\sailor-ingest.sock` files nobody could
  open or delete ("The file cannot be accessed by the system"), and every later
  launch crashed on them. Fix: quit Docker, rename the `run` folder aside, and
  have Josh start Docker from the Start menu.
- [db] 2026-11-24: BEFORE triggers run before RLS WITH CHECK, so a BEFORE INSERT
  trigger that raises its own error masks an RLS denial (the RLS probe test saw
  23503 instead of 42501). Integrity checks that need a lookup are AFTER
  constraint triggers.
- [db] 2026-11-24: To count rows an UPDATE/DELETE changed under RLS in pgTAP, use
  a top-level CTE: `with u as (update ... returning 1) select is(count(*)::int, 0,
  '...') from u;`. A data-modifying CTE can't sit inside a subquery, and RLS
  USING denials change 0 rows instead of raising.

- [db] In `select court_end::text ... order by inning, court_end`, the ORDER BY
  binds to the text-cast output column and sorts north before south. Sort on
  the enum column itself (qualify it, or don't alias over it).
- [db] Seed data the database doesn't validate (ringer combinations are
  app-enforced only) needs checking against the ringer table by hand.
- [build] The dev machine needs Node LTS and Docker Desktop (local Supabase).
  After installing Node with winget, shells needed PATH patched until restarted.
- [build] TypeScript is pinned to 6.x: TypeScript 7 (native) isn't supported by
  svelte-check yet (ERESOLVE on install).
- [ui] The prototype's design-system CSS squares every `.btn` and makes
  buttons 30–38px tall. The app keeps rounded corners and 44px tap targets;
  CLAUDE.md's rules win over the prototype's rendering.
- [ui] Prototype-vs-app screenshot pairs (`node scripts/capture-3b.mjs`) are the
  reliable way to check visual fidelity. The prototype needs network (React from
  unpkg) and must be served over http, not file://.
- [deploy] `compatibility_date` in wrangler.jsonc must not be newer than the
  installed wrangler supports, or `wrangler dev` fails. Don't just use today.
- [deploy] Cloudflare matches `_headers` by request path: a rule for
  `/index.html` doesn't cover `/`, and `/index.html` 307-redirects to `/`.
  Check the real dist/ before writing cache rules.
- [deploy] Branch previews run `npx wrangler preview` (open beta), which fails
  without a `"previews": {}` block in wrangler.jsonc. GitHub's check showed
  "failed in 0s" for a build that ran ~40 s: read the Cloudflare build log.
- [deploy] Cloudflare's build image runs npm 10.9 and skips dependency install
  scripts (esbuild, workerd). Harmless today; first suspect if a build fails on
  a missing native binary.
- [deploy] Merge to main with `git merge --ff-only` and production ships exactly
  the commit the preview built (zero new uploads). GitHub's merge buttons
  rewrite the commit: same code, new build tag.
- [pwa] vite-plugin-pwa's `updateSW(true)` doesn't reload the page when the
  update was found by our own `registration.update()` (Workbox calls it
  "external"). We reload on `controllerchange`. Update flows need a real
  two-build test, not mocks (tests/e2e/update.spec.ts).
- [pwa] Each preview URL is its own origin: separate install, service worker,
  and saved game. Testing a preview never touches a real game on production.
- [pwa] Android: the installed app shares storage with Chrome. iOS doesn't
  (see Open items).
