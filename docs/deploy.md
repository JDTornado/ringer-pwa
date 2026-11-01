# Deploying Ringer (Cloudflare)

The app is a static site served by **Cloudflare Workers static assets**. There
is no server code: Cloudflare serves the files in `dist/`. **Workers Builds**
(Cloudflare's CI, connected to the GitHub repo) builds and deploys it.

## How a deploy happens

| You do | Cloudflare does | Result |
|---|---|---|
| Push to `main` | Builds and deploys | **Production** at the Worker's URL |
| Push any other branch | Builds and uploads a preview version | A **preview URL** for that branch; production untouched |

So **pushing to `main` is a production deploy.** Merge to `main` only when the
change is approved and verified (see CLAUDE.md, "Definition of done").

What's in the repo:

- `wrangler.jsonc`: Worker name (`ringer`), compatibility date, and the assets
  config: serve `./dist`, and fall back to `index.html` for unknown paths
  (`single-page-application`).
- `public/_headers`: copied into `dist/` by Vite, read by Cloudflare.
  - `no-cache` on `/`, `/index.html`, `/sw.js`, and `/manifest.webmanifest`,
    so a new deploy is picked up and the service worker can update.
  - Long-lived `immutable` caching on `/assets/*`. Vite hashes these
    filenames, so a changed file always gets a new name.
  - `X-Robots-Tag: noindex` everywhere. The app is public but unlisted.
- `.node-version`: the Node major version Cloudflare's build image uses.

## How users get updates

The app never reloads itself. A reload could wipe a half-entered frame
mid-game, so updates wait for the user:

1. The app checks for a new deploy when it comes back to the foreground, and
   hourly while it's open. (`sw.js` is served `no-cache`, so the check
   always reaches Cloudflare.)
2. A new version downloads in the background and waits. A slim **"Update
   available"** banner appears at the top with a **Reload** button.
3. **Reload is disabled whenever it would lose input**: while a frame is
   half-entered or a past frame is being edited ("Finish this frame first"),
   and on setup while any of the six fields has text ("Finish setup first").
   It's enabled on an empty setup form, on game over, and on the scoring screen
   when the entry card is empty.
4. Tapping Reload switches to the new version and reloads. Confirmed frames are
   already saved on the device, so the game resumes where it was.

If the user ignores the banner, the old version keeps working. The new one
takes over the next time the app is fully closed and reopened.

**Which version is a phone running?** The setup screen shows a small
`build abc1234` tag: the commit's short SHA (from Cloudflare's
`WORKERS_CI_COMMIT_SHA`; `git` locally; `dev` if neither).

This is covered by `tests/e2e/update.spec.ts`. It builds two versions, serves
the first, starts a game, "deploys" the second, and checks the banner, the
Reload gating, and that the game resumes after Reload. Chromium and WebKit
only, so on a real phone, check once after a deploy:

1. With the app open on the scoring screen, push a change to `main` and wait
   for the deploy.
2. Switch away from the app and back. The banner should appear within a few
   seconds.
3. Tap a team: Reload greys out with "Finish this frame first". Confirm the
   frame: Reload enables.
4. Tap Reload: same inning, same score, and the setup screen's build tag shows
   the new SHA after the game.

## Dashboard settings

What Josh configured in the Cloudflare dashboard (2026-11-01):

| Setting | Value |
|---|---|
| Account | Josh's personal Cloudflare account (JDTornado) |
| Worker name | `ringer` (must match `wrangler.jsonc`) |
| Git repository | `JDTornado/ringer-pwa` |
| Production branch | `main` |
| Root directory | repo root |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Preview builds | On by default for all non-production branches (the new-Worker default, per the dashboard notice). The dashboard doesn't show the preview command. **To confirm on the first branch push.** |
| Build environment variables | none |
| Production URL | https://ringer.jdtornado.workers.dev |
| Custom domain | none |

`wrangler.jsonc` sets `workers_dev: true` and `preview_urls: true`
explicitly. Both match Cloudflare's defaults; they're written out so wrangler
stops warning that they're implicit.

## Rolling back

1. Cloudflare dashboard → **Workers & Pages** → **ringer** → **Deployments**.
2. Find the last good version and choose **Rollback** (or deploy that version).
3. Then fix forward in git. The next push to `main` deploys again, so revert
   the bad commit on `main` (or merge a fix) before anyone pushes.

Phones running the bad version see the "Update available" banner for the
rolled-back version on their next foreground or hourly check, and switch when
they tap Reload (or when the app is fully closed and reopened).

## Checking a change locally before it ships

```
npm run deploy:dry     # build + wrangler deploy --dry-run: validates config, uploads nothing
npm run build
npx wrangler dev       # serves dist/ like Cloudflare does (headers, SPA fallback)
```

Neither needs a Cloudflare login. Don't run `wrangler login` or a real
`wrangler deploy` from a dev machine: deploys go through Workers Builds only.

If `wrangler dev` fails with "This Worker requires compatibility date …", the
date in `wrangler.jsonc` is newer than the installed wrangler supports. Use a
date the installed version supports, or update wrangler.
