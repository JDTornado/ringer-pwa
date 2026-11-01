-- ============================================================================
-- Horseshoe League — Postgres schema (Supabase)
-- DRAFT for review. Once approved, this becomes the first migration:
--   supabase/migrations/<timestamp>_initial_schema.sql
-- (see docs/database.md). Structure + RLS enabled (deny-all by default);
-- RLS policies and stats views come in later migrations.
--
-- Design spine: PLAYERS are the core entity. Accounts, team membership, and
-- game participation are all separate relationships TO a player, never baked
-- into it. That is what lets a person be:
--   - a player without an account (paper holdouts)
--   - a player without a team (rovers, guests)
--   - a player who plays for a team they don't belong to (subs)
-- ...possibly all at once.
-- ============================================================================

-- ---------- Enums ----------------------------------------------------------

create type participant_capacity as enum ('roster', 'rover', 'sub_pool', 'guest');
create type court_end            as enum ('north', 'south');
create type game_source          as enum ('app', 'paper');
create type game_detail_level    as enum ('frame', 'final_only');
create type entity_status        as enum ('scheduled', 'in_progress', 'complete', 'voided');

-- ---------- Players (core entity) ------------------------------------------
-- Every person who ever plays. Independent of accounts and teams.

create table players (
  id                   uuid primary key default gen_random_uuid(),
  display_name         text not null,
  -- Optional link to a Supabase Auth account. NULL = player has no login
  -- (e.g. a paper holdout, or a guest). One account maps to one player.
  auth_user_id         uuid unique references auth.users (id) on delete set null,
  is_guest             boolean not null default false,   -- ad-hoc fill-ins
  -- When a guest is later reconciled to a real player, point here so their
  -- game history can be followed without rewriting past rows.
  merged_into_player_id uuid references players (id),
  created_at           timestamptz not null default now()
);

-- ---------- Seasons --------------------------------------------------------

create table seasons (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  starts_on   date,
  ends_on     date,
  created_at  timestamptz not null default now()
);

-- ---------- Teams (per season) ---------------------------------------------

create table teams (
  id               uuid primary key default gen_random_uuid(),
  season_id        uuid not null references seasons (id) on delete cascade,
  name             text not null,
  captain_player_id uuid references players (id),
  created_at       timestamptz not null default now(),
  unique (season_id, name)
);

-- ---------- Team membership (the roster) -----------------------------------
-- A player's team affiliation FOR A SEASON. This is the "roster of 8".
-- Teamless players (rovers/guests) simply have no row here.
-- A player is on at most one team per season.

create table team_memberships (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references seasons (id) on delete cascade,
  team_id     uuid not null references teams (id)   on delete cascade,
  player_id   uuid not null references players (id) on delete cascade,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (season_id, player_id)   -- one team per player per season
);

-- ---------- Match nights ---------------------------------------------------

create table match_nights (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references seasons (id) on delete cascade,
  played_on   date not null,
  venue       text,
  status      entity_status not null default 'scheduled',
  created_at  timestamptz not null default now()
);

-- ---------- Team matches (Team A vs Team B on a night) ----------------------

create table team_matches (
  id          uuid primary key default gen_random_uuid(),
  night_id    uuid not null references match_nights (id) on delete cascade,
  season_id   uuid not null references seasons (id),        -- denormalized for queries
  team_a_id   uuid not null references teams (id),
  team_b_id   uuid not null references teams (id),
  status      entity_status not null default 'scheduled',
  created_at  timestamptz not null default now(),
  check (team_a_id <> team_b_id)
);

-- ---------- Pairings (a team's night pair; the captain's setup) -------------
-- Night-scoped. Three per team per night. This is the captain's INTENT.
-- Who actually played each game is recorded per-game in game_participants,
-- which is the authoritative record for stats.

create table pairings (
  id            uuid primary key default gen_random_uuid(),
  team_match_id uuid not null references team_matches (id) on delete cascade,
  team_id       uuid not null references teams (id),
  slot          smallint not null check (slot between 1 and 3),
  created_at    timestamptz not null default now(),
  unique (team_match_id, team_id, slot)
);

-- ---------- Games ----------------------------------------------------------

create table games (
  id                  uuid primary key default gen_random_uuid(),
  -- Device-generated on creation; makes offline creation idempotent so a
  -- retried sync can't produce a duplicate game.
  client_game_id      uuid not null unique,
  team_match_id       uuid references team_matches (id) on delete cascade, -- NULL for ad-hoc games
  round               smallint,
  court               smallint,
  source              game_source       not null default 'app',
  detail_level        game_detail_level not null default 'frame',
  status              entity_status     not null default 'scheduled',
  scored_by_player_id uuid references players (id),        -- current/last scorer (audit)
  rules               jsonb,                                -- snapshot: end condition, etc.
  final_score_a       integer,   -- derived (sum of frame points) for app games; entered for final_only
  final_score_b       integer,
  played_at           timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default now()
);

-- ---------- Game participants (WHO played this game) -----------------------
-- The authoritative per-game snapshot. This is where the sub case lives:
--   team_id      = the team the player PLAYED FOR in this game
--   home_team_id = their actual season team, when different (rovers/subs)
--   capacity     = how they're playing (roster / rover / sub_pool / guest)
-- Stats attribution (played-for team vs home team vs player-only) is a LATER
-- query decision; the schema records all three facts so any choice is possible.

create table game_participants (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references games (id)   on delete cascade,
  player_id     uuid not null references players (id),
  team_id       uuid not null references teams (id),          -- played FOR
  home_team_id  uuid references teams (id),                   -- belongs to (if different)
  capacity      participant_capacity not null default 'roster',
  court_end     court_end not null,
  created_at    timestamptz not null default now(),
  unique (game_id, player_id)
);

-- ---------- Frames (the atomic scoring record) -----------------------------
-- One end's throw = one frame = one score. Two frames per inning: south first,
-- then north. thrower_a / thrower_b are Team A's and Team B's players at that
-- end. Only one team scores per frame. Ringers are entered as a per-thrower
-- count (0-2); dead ringers are DERIVED, not entered.

create table frames (
  id                     uuid primary key default gen_random_uuid(),
  game_id                uuid not null references games (id) on delete cascade,
  inning                 smallint not null check (inning >= 1),   -- 1..15, higher = extra innings
  court_end              court_end not null,                      -- south is thrown first each inning

  thrower_a_participant_id uuid not null references game_participants (id),
  thrower_b_participant_id uuid not null references game_participants (id),

  ringers_a              smallint not null default 0 check (ringers_a between 0 and 2),
  ringers_b              smallint not null default 0 check (ringers_b between 0 and 2),
  -- Derived and stored so it can't drift: dead = the smaller of the two counts.
  dead_ringers           smallint generated always as (least(ringers_a, ringers_b)) stored,

  scoring_team_id        uuid references teams (id),   -- NULL = nobody scored this frame
  points                 smallint not null default 0 check (points between 0 and 6),

  created_at             timestamptz not null default now(),

  unique (game_id, inning, court_end),  -- one frame per end per inning
  -- Points only exist when a team scored; a no-score frame is 0.
  check (
    (scoring_team_id is null and points = 0) or
    (scoring_team_id is not null and points between 1 and 6)
  )
);

-- Frame ordering within a game: (inning, court_end) with south before north.
-- Running totals and all stats are derived from frames; nothing is entered
-- as a total.

-- ---------- Helpful indexes ------------------------------------------------

create index on team_memberships (team_id);
create index on team_memberships (player_id);
create index on games (team_match_id);
create index on game_participants (game_id);
create index on game_participants (player_id);
create index on frames (game_id);

-- ---------- Row-Level Security: on for every table -------------------------
-- Enabled with NO policies = nobody can read or write through the API. Safe
-- default; access is opened deliberately, per table, in a later migration.

alter table players           enable row level security;
alter table seasons           enable row level security;
alter table teams             enable row level security;
alter table team_memberships  enable row level security;
alter table match_nights      enable row level security;
alter table team_matches      enable row level security;
alter table pairings          enable row level security;
alter table games             enable row level security;
alter table game_participants enable row level security;
alter table frames            enable row level security;

-- ============================================================================
-- STILL TO DO (later migrations, deliberately not built yet):
--   * RLS policies — who can read (likely: league members), who can write a
--     game (its current scorer), who can enter paper results (officers).
--   * Stats views (standings, per-player ringer %, leaderboards). These are
--     SQL over the tables above; the attribution rule for subs is a WHERE/JOIN
--     decision made once the league settles it. The raw data already supports
--     every option.
--   * Guest-merge procedure (fold a guest player into a real one).
--   * App-level invariants worth enforcing (2 participants per team per game,
--     one per end; scoring_team must be one of the game's two teams).
-- ============================================================================
