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
  - `no-cache` on `/`, `/index.html`, `/sw.js`, `/registerSW.js`, and
    `/manifest.webmanifest`, so a new deploy is picked up and the service
    worker can update.
  - Long-lived `immutable` caching on `/assets/*`. Vite hashes these
    filenames, so a changed file always gets a new name.
  - `X-Robots-Tag: noindex` everywhere. The app is public but unlisted.
- `.node-version`: the Node major version Cloudflare's build image uses.

Users get updates automatically: the service worker is set to `autoUpdate`, so
an open app picks up a new deploy on its next load.

## Dashboard settings

_Filled in from what Josh configured in the Cloudflare dashboard._

| Setting | Value |
|---|---|
| Account | _TBD_ |
| Worker name | `ringer` (must match `wrangler.jsonc`) |
| Git repository | _TBD_ |
| Production branch | `main` |
| Build command | _TBD_ (expected: `npm run build`) |
| Deploy command | _TBD_ (Workers Builds default: `npx wrangler deploy`) |
| Non-production branch deploy command | _TBD_ (default: `npx wrangler versions upload`) |
| Preview URLs | _TBD_ |
| Root directory | _TBD_ (repo root) |
| Build environment variables | _TBD_ (none needed yet) |
| Production URL | _TBD_ |
| Custom domain | _TBD_ (none yet) |

## Rolling back

1. Cloudflare dashboard → **Workers & Pages** → **ringer** → **Deployments**.
2. Find the last good version and choose **Rollback** (or deploy that version).
3. Then fix forward in git. The next push to `main` deploys again, so revert
   the bad commit on `main` (or merge a fix) before anyone pushes.

Because of `autoUpdate`, phones running the bad version pick up the
rolled-back one on their next load. An installed app that is open may need
to be closed and reopened.

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
