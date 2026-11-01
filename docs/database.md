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
3. **Verify.** Run the checks in `docs/data-model.md` that apply (constraints reject
   invalid frames, generated columns compute, etc.). Regenerate types:
   `npx supabase gen types typescript --local > src/lib/database.types.ts`.
4. **Present for approval.** Summarize the migration in plain terms: tables/columns
   added or changed, constraints, RLS state, anything destructive. Wait for Josh.
5. **Push (after approval only).** `npx supabase db push` applies pending migrations
   to the hosted project. Then regenerate types against the linked project if they
   differ.

Destructive changes (dropping or renaming a column/table, changing a type that
could truncate data) are always called out explicitly in step 4, even if the
hosted database is empty.

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
exercise stats queries locally.
