# Database workflow (Supabase)

How the database gets built and changed. Claude Code does the work; Josh approves
every schema change before it touches the hosted database.

## Principles

1. **Migrations in the repo are the source of truth.** Every schema change is a SQL
   file in `supabase/migrations/`, committed to git. Nobody edits the hosted schema
   by clicking in the Supabase dashboard. If it isn't in a migration, it doesn't exist.
2. **`docs/data-model.md` is the spec; migrations implement it.** Schema changes
   start from the spec. If a migration needs something the spec doesn't say, update
   the spec in the same change (or stop and ask).
3. **Nothing reaches the hosted database without approval.** Claude Code may write
   migrations and apply them to the *local* database freely. Pushing to the hosted
   project is an explicit, approved step.
4. **Never edit a migration that has already been pushed.** Fix forward with a new
   migration.
5. **Every table gets Row-Level Security enabled in the migration that creates it.**
   Supabase exposes every `public` table through its API; RLS enabled with no
   policies means "nobody can read or write," which is the safe default. Policies
   are added deliberately, per table, in their own migration.

## One-time setup (Josh)

```bash
npm install -D supabase          # Supabase CLI as a dev dependency
npx supabase login               # opens a browser; stores an access token locally
npx supabase init                # creates supabase/ (config.toml, migrations/)
npx supabase link --project-ref <project-ref>   # prompts for the DB password
```

- Create the hosted project in the Supabase dashboard first (free tier). The
  project ref is in the project URL / settings.
- **Optional but recommended: local Supabase.** `npx supabase start` runs the full
  stack (Postgres, API, Auth, Studio) in Docker. Requires Docker Desktop on Windows.
  This is what lets Claude Code build and test schema changes without touching the
  hosted database.
- Secrets: the CLI login token and DB password stay on Josh's machine. The
  `service_role` key never goes in the repo or the frontend. The frontend uses only
  the project URL and the publishable/anon key, which are safe to expose *because*
  RLS is on.

## The change loop

1. **Propose.** Claude Code reads `docs/data-model.md`, then creates a migration:
   `npx supabase migration new <short_description>` and writes the SQL into the
   generated file.
2. **Apply locally.** `npx supabase db reset` rebuilds the local database from all
   migrations (and `supabase/seed.sql` if present). Any SQL error surfaces here.
3. **Verify.** Run `npx supabase test db` — the checks under *Schema checks* below,
   written as pgTAP tests in `supabase/tests/`. Add tests for anything new the
   migration enforces. Regenerate types:
   `npx supabase gen types typescript --local > src/lib/database.types.ts`.
4. **Present for approval.** Summarize the migration in plain terms: tables/columns
   added or changed, constraints, RLS state, anything destructive. Wait for Josh.
5. **Push (after approval only).** `npx supabase db push` applies pending migrations
   to the hosted project. Then regenerate types against the linked project if they
   differ.

Destructive changes (dropping or renaming a column/table, changing a type that
could truncate data) are always called out explicitly in step 4, even if the
hosted database is empty.

## Schema checks

Each is a test that tries the bad thing against the local database and expects
it to fail (or the derived value to be right). They encode `docs/data-model.md`;
if the schema can't satisfy one, that's a spec/schema disagreement — stop and ask.

- A frame's ringer count outside 0–2 is rejected.
- A no-score frame (no scoring team) must have 0 points; a scoring frame must have
  1–6 points. **5 points is rejected.**
- `dead_ringers` equals the smaller of the two throwers' counts.
- A second frame for the same game, inning, and end is rejected.
- A frame's two throwers are participants in the same game, thrower A on side `a`
  and thrower B on side `b`.
- A `frame`-level game has null final scores; a `final_only` game has no
  frames.
- Frames sort in play order with a plain `ORDER BY inning, court_end` (south first).
- A duplicate `client_game_id` is rejected (offline-retry idempotency).
- A player can't be on two teams in the same season.
- Schedule: a team match's night and teams are in its season; a pit goes to one
  team match per night; a pairing's team is in its team match; a game's night,
  teams, pairings and pit match its team match; each grid cell is played once
  (voided games excepted).
- Every table in `public` has RLS enabled. Anon, and a signed-in account with no
  linked player, can't read or write any of them.
- Access (`03_access.test.sql`, run as the seed's accounts): members read; only
  the owner edits a game until it locks; handoffs are the only way to change
  scorer; locked games are admin-only and audited; an account claims a player
  once, then only an admin can relink.

## Supabase MCP server (optional, read-only)

Supabase publishes an official MCP server Claude Code can connect to. Use it for
**inspection** — browsing tables, checking what's actually deployed, looking up
Supabase docs — not for making schema changes.

- Scope it to this project and make it read-only by adding
  `project_ref=<project-ref>&read_only=true` to the server URL
  (`https://mcp.supabase.com/mcp`). The dashboard can generate this URL.
- Schema changes still go through migration files and `db push`, so they're
  reviewed and versioned in git. A change made through MCP bypasses both.

## Seed data

`supabase/seed.sql` runs on every local `db reset`, never on the hosted project.
Use it for a realistic test season: a couple of teams, players (including one
guest and one rover), a match night, and a completed game with frames — enough to
exercise stats queries locally. It also creates local sign-in accounts (admin,
two members, one unlinked); the header of `seed.sql` lists them.

To make someone an admin (local, or hosted once approved), run in SQL:
`insert into public.admins (user_id, note) values ('<auth user id>', '<name>');`

## Sign-in (email code)

The app signs in with a **6-digit code typed into the app** (`signInWithOtp` +
`verifyOtp`, type `email`), never a magic link: on iOS a link opens Safari,
whose storage is separate from the installed app. Google sign-in is deferred
(no Google Cloud project yet); it would plug in beside the email form.

- **Local:** the app reads `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env.local` (copy `.env.example`). Codes
  land in the local Mailpit inbox at http://127.0.0.1:54324. The seed accounts
  (`tom@ringer.test`, `new@ringer.test`, ...) can sign in this way.
- **Email template:** `supabase/templates/sign_in_code.html` (code only, no
  link), used for both the magic-link and confirmation emails in
  `config.toml`. Supabase's default template has only a link, so **the hosted
  project needs the same template pasted into Auth → Email Templates (both
  "Magic Link" and "Confirm signup")** before anyone can sign in there.
- **First sign-in:** the account picks its player from `claimable_players()`
  (unlinked accounts can't read `players` through RLS), then `claim_player()`.
- **Rate limits:** Supabase allows one code per email per second (more on the
  hosted project, 60 s by default). Local `email_sent` is raised for e2e.
- `npm run test:e2e` needs local Supabase running; it reads the URL and keys
  from `supabase status` and creates (and deletes) its own test accounts.
