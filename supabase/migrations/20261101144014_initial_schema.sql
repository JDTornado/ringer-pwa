-- ============================================================================
-- Horseshoe League: initial schema (Supabase / Postgres)
--
-- Implements docs/data-model.md (rules and meaning). Workflow: docs/database.md.
-- Structure, integrity constraints, one derived view (game_scores), and RLS
-- enabled on every table with NO policies (deny-all through the API). Access
-- policies, stats views, and standings come in later migrations.
--
-- Design spine: PLAYERS are the core entity. Accounts, team membership, and
-- game participation are all separate relationships TO a player, never baked
-- into it. That is what lets a person be:
--   - a player without an account (paper holdouts)
--   - a player without a team (rovers, guests)
--   - a player who plays for a team they don't belong to (subs)
-- ...possibly all at once.
--
-- Frames are the source of truth for scoring. Totals are DERIVED (see the
-- game_scores view), never stored, except final_score_a/b on final_only
-- games, where the paper sheet has nothing else.
--
-- The database enforces only the hard ranges of a frame (ringers 0-2,
-- points 0-6, never 5, 0 points exactly when nobody scored). The full
-- score -> ringer-combination table lives in the app (src/domain/ringerRules.ts)
-- so an impossible paper entry can be saved and FLAGGED rather than refused.
-- ============================================================================

-- ---------- Enums ----------------------------------------------------------

create type participant_capacity as enum ('roster', 'rover', 'sub_pool', 'guest');
-- Declared south-first so enum order = play order:
--   ORDER BY inning, court_end  ->  inning 1 south, inning 1 north, inning 2 south, ...
create type court_end            as enum ('south', 'north');
-- A game's two sides. Side 'a' plays for games.team_a_id, side 'b' for team_b_id.
create type game_side            as enum ('a', 'b');
create type game_source          as enum ('app', 'paper');
create type game_detail_level    as enum ('frame', 'final_only');
create type entity_status        as enum ('scheduled', 'in_progress', 'complete', 'voided');

-- ---------- Shared trigger functions ---------------------------------------

-- Keeps updated_at current on every UPDATE.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Rejects UPDATE on append-only log tables.
create function public.reject_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only; rows cannot be updated', tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

-- ---------- Players (core entity) ------------------------------------------
-- Every person who ever plays. Independent of accounts and teams.

create table players (
  id                    uuid primary key default gen_random_uuid(),
  display_name          text not null,
  -- Optional link to a Supabase Auth account. NULL = player has no login
  -- (e.g. a paper holdout, or a guest). One account maps to one player.
  auth_user_id          uuid unique references auth.users (id) on delete set null,
  is_guest              boolean not null default false,   -- ad-hoc fill-ins
  -- When a guest is later reconciled to a real player, point here so their
  -- game history can be followed without rewriting past rows.
  merged_into_player_id uuid references players (id),
  created_at            timestamptz not null default now(),
  constraint players_not_merged_into_self check (merged_into_player_id <> id)
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
  id                uuid primary key default gen_random_uuid(),
  season_id         uuid not null references seasons (id) on delete cascade,
  name              text not null,
  captain_player_id uuid references players (id),
  created_at        timestamptz not null default now(),
  unique (season_id, name),
  -- Target for composite FKs that pin a team to a season (memberships, matches).
  unique (id, season_id)
);

-- ---------- Team membership (the roster) -----------------------------------
-- A player's team affiliation FOR A SEASON. This is the "roster of 8".
-- Teamless players (rovers/guests) simply have no row here.
-- A player is on at most one team per season.

create table team_memberships (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references seasons (id) on delete cascade,
  team_id     uuid not null,
  player_id   uuid not null references players (id) on delete cascade,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (season_id, player_id),   -- one team per player per season
  -- The team must belong to the same season as the membership.
  constraint team_memberships_team_season_fk
    foreign key (team_id, season_id) references teams (id, season_id) on delete cascade
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
  team_a_id   uuid not null,
  team_b_id   uuid not null,
  status      entity_status not null default 'scheduled',
  created_at  timestamptz not null default now(),
  constraint team_matches_teams_differ check (team_a_id <> team_b_id),
  -- Both teams must belong to the match's season.
  constraint team_matches_team_a_season_fk
    foreign key (team_a_id, season_id) references teams (id, season_id),
  constraint team_matches_team_b_season_fk
    foreign key (team_b_id, season_id) references teams (id, season_id)
);

-- ---------- Pairings (a team's night pair; the captain's setup) -------------
-- Night-scoped. Three per team per night. This is the captain's INTENT.
-- Who actually played each game is recorded per-game in game_participants,
-- which is the authoritative record for stats. Never compute a stat by
-- joining a game to its pairing's members.

create table pairings (
  id            uuid primary key default gen_random_uuid(),
  team_match_id uuid not null references team_matches (id) on delete cascade,
  team_id       uuid not null references teams (id),
  slot          smallint not null check (slot between 1 and 3),
  created_at    timestamptz not null default now(),
  unique (team_match_id, team_id, slot)
);

-- The two players in a pairing, as the captain set them at the start of the
-- night: one at each end. capacity + home_team_id record how a non-roster
-- player (rover, pool sub, guest) came to be in the pairing.

create table pairing_members (
  id            uuid primary key default gen_random_uuid(),
  pairing_id    uuid not null references pairings (id) on delete cascade,
  player_id     uuid not null references players (id),
  capacity      participant_capacity not null default 'roster',
  home_team_id  uuid references teams (id),   -- for rovers: the team they normally play for
  court_end     court_end not null,
  created_at    timestamptz not null default now(),
  unique (pairing_id, player_id),
  unique (pairing_id, court_end)   -- one member per end => at most 2 per pairing
);

-- ---------- Games ----------------------------------------------------------

create table games (
  id                       uuid primary key default gen_random_uuid(),
  -- Device-generated on creation; makes offline creation idempotent so a
  -- retried sync can't produce a duplicate game.
  client_game_id           uuid not null unique,
  team_match_id            uuid references team_matches (id) on delete cascade, -- NULL for games outside a team match
  -- Every stored game uses real team rows. Side 'a' = team_a, side 'b' = team_b.
  team_a_id                uuid not null references teams (id),
  team_b_id                uuid not null references teams (id),
  -- The captain's intended pairings. Links to intent; NOT the record of who played.
  pairing_a_id             uuid references pairings (id),
  pairing_b_id             uuid references pairings (id),
  round                    smallint,
  court                    smallint,
  source                   game_source       not null default 'app',
  detail_level             game_detail_level not null default 'frame',
  status                   entity_status     not null default 'scheduled',
  -- Who holds the game right now. Mutable; history is in game_scorer_handoffs.
  current_scorer_player_id uuid references players (id),
  -- For paper entry: who typed it in, distinct from who kept score.
  entered_by_player_id     uuid references players (id),
  -- Snapshot of the rules this game was played under (endCondition etc.).
  rules                    jsonb not null check (jsonb_typeof(rules) = 'object'),
  -- ONLY for final_only games, where the final is all the sheet has. For
  -- frame games these are NULL and the score is derived (see game_scores).
  final_score_a            integer check (final_score_a >= 0),
  final_score_b            integer check (final_score_b >= 0),
  played_at                timestamptz,
  completed_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint games_teams_differ check (team_a_id <> team_b_id),
  constraint games_final_scores_by_detail_level check (
    case detail_level
      when 'frame' then final_score_a is null and final_score_b is null
      -- final_only: both entered, or neither yet (e.g. created before entry).
      else (final_score_a is null) = (final_score_b is null)
    end
  ),
  -- Target for frames' composite FK (see frames: "a final_only game has no frames").
  unique (id, detail_level)
);

create trigger games_set_updated_at
  before update on games
  for each row execute function public.set_updated_at();

-- ---------- Scorer handoffs (append-only log) ------------------------------
-- One row per transfer of the scorekeeping role. Handoff (who RECORDS) is a
-- different event from substitution (who PLAYS, see game_participants).
-- UPDATE is rejected by trigger. DELETE is left to the games cascade; no
-- RLS policy will grant DELETE to clients.

create table game_scorer_handoffs (
  id             uuid primary key default gen_random_uuid(),
  game_id        uuid not null references games (id) on delete cascade,
  player_id      uuid not null references players (id),   -- the NEW scorer
  from_inning    smallint not null check (from_inning >= 1),
  handed_off_at  timestamptz not null default now()
);

create trigger game_scorer_handoffs_append_only
  before update on game_scorer_handoffs
  for each row execute function public.reject_update();

-- ---------- Game participants (WHO played this game) -----------------------
-- The authoritative per-game snapshot. This is where the sub case lives:
--   side         = which side of the game they played on; the team played
--                  FOR is games.team_a_id / team_b_id for that side
--   home_team_id = their actual season team, when different (rovers/subs)
--   capacity     = how they're playing (roster / rover / sub_pool / guest)
-- A side may have MORE than 2 participants when someone leaves early and is
-- replaced; who threw each frame is recorded on the frame.
-- Stats attribution (played-for team vs home team vs player-only) is a LATER
-- query decision; the schema records all three facts so any choice is possible.

create table game_participants (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references games (id) on delete cascade,
  player_id     uuid not null references players (id),
  side          game_side not null,
  home_team_id  uuid references teams (id),
  capacity      participant_capacity not null default 'roster',
  court_end     court_end not null,
  created_at    timestamptz not null default now(),
  unique (game_id, player_id),
  -- Target for frames' composite FKs (thrower must be in this game, on this side).
  unique (id, game_id, side)
);

-- ---------- Frames (the atomic scoring record) -----------------------------
-- One end's throw = one frame = one score. Two frames per inning: south first,
-- then north; play order is ORDER BY inning, court_end. thrower_a / thrower_b
-- are side A's and side B's players at that end. Only one side scores per
-- frame. Ringers are entered as a per-thrower count (0-2); dead ringers are
-- DERIVED, not entered.
--
-- Cross-table rules are enforced with composite foreign keys rather than
-- triggers. Each FK carries a constant GENERATED column on the frame side,
-- so the referenced row must match that constant:
--
--   (thrower_a_participant_id, game_id, thrower_a_side='a')
--       -> game_participants (id, game_id, side)
--   (thrower_b_participant_id, game_id, thrower_b_side='b')
--       -> game_participants (id, game_id, side)
--     The thrower must be a participant of THIS game on the right side. And
--     because these FKs are NO ACTION, a participant can't later be moved to
--     another game or side while frames reference them.
--
--   (game_id, game_detail_level='frame') -> games (id, detail_level)
--     A frame can only belong to a 'frame' game, and a game that has frames
--     can't be switched to 'final_only' (the update would orphan the FK).
--
-- Unlike triggers, FKs are declarative, can't be bypassed by session
-- settings, and are checked on BOTH sides (insert/update of the frame AND
-- update/delete of the referenced row).

create table frames (
  id                       uuid primary key default gen_random_uuid(),
  game_id                  uuid not null,
  game_detail_level        game_detail_level generated always as ('frame'::game_detail_level) stored,
  inning                   smallint not null check (inning >= 1),   -- 1..15, higher = extra innings
  court_end                court_end not null,                      -- south is thrown first each inning

  thrower_a_participant_id uuid not null,
  thrower_a_side           game_side generated always as ('a'::game_side) stored,
  thrower_b_participant_id uuid not null,
  thrower_b_side           game_side generated always as ('b'::game_side) stored,

  ringers_a                smallint not null default 0 check (ringers_a between 0 and 2),
  ringers_b                smallint not null default 0 check (ringers_b between 0 and 2),
  -- Derived and stored so it can't drift: dead = the smaller of the two counts.
  dead_ringers             smallint generated always as (least(ringers_a, ringers_b)) stored,

  scoring_side             game_side,   -- NULL = nobody scored this frame
  -- 0-6 to the scoring side; 5 is impossible with two shoes.
  points                   smallint not null default 0 check (points between 0 and 6 and points <> 5),

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  unique (game_id, inning, court_end),  -- one frame per end per inning
  -- Points only exist when a side scored; a no-score frame is 0.
  constraint frames_points_match_scoring_side check (
    (scoring_side is null and points = 0) or
    (scoring_side is not null and points between 1 and 6)
  ),
  constraint frames_game_is_frame_level_fk foreign key (game_id, game_detail_level)
    references games (id, detail_level) on delete cascade,
  constraint frames_thrower_a_fk foreign key (thrower_a_participant_id, game_id, thrower_a_side)
    references game_participants (id, game_id, side),
  constraint frames_thrower_b_fk foreign key (thrower_b_participant_id, game_id, thrower_b_side)
    references game_participants (id, game_id, side)
);

create trigger frames_set_updated_at
  before update on frames
  for each row execute function public.set_updated_at();

-- ---------- Derived: game scores -------------------------------------------
-- Each game's score per side. frame games: sum of frame points per scoring
-- side (0 when no frames yet). final_only games: the entered finals (NULL
-- until entered).
-- security_invoker = true makes the view run with the CALLER's permissions,
-- so RLS on games/frames applies. Without it, a view runs as its owner and
-- bypasses RLS.

create view game_scores with (security_invoker = true) as
select
  g.id           as game_id,
  g.detail_level,
  case g.detail_level
    when 'frame' then coalesce(sum(f.points) filter (where f.scoring_side = 'a'), 0)::integer
    else g.final_score_a
  end            as score_a,
  case g.detail_level
    when 'frame' then coalesce(sum(f.points) filter (where f.scoring_side = 'b'), 0)::integer
    else g.final_score_b
  end            as score_b
from games g
left join frames f on f.game_id = g.id
group by g.id;

-- ---------- Helpful indexes ------------------------------------------------
-- (Columns already leading a unique constraint are indexed by it.)

create index on team_memberships (team_id);
create index on team_memberships (player_id);
create index on team_matches (night_id);
create index on pairing_members (player_id);
create index on games (team_match_id);
create index on game_scorer_handoffs (game_id);
create index on game_participants (player_id);
create index on frames (thrower_a_participant_id);
create index on frames (thrower_b_participant_id);

-- ---------- Row-Level Security: on for every table -------------------------
-- Enabled with NO policies = nobody can read or write through the API. Safe
-- default; access is opened deliberately, per table, in a later migration.

alter table players              enable row level security;
alter table seasons              enable row level security;
alter table teams                enable row level security;
alter table team_memberships     enable row level security;
alter table match_nights         enable row level security;
alter table team_matches         enable row level security;
alter table pairings             enable row level security;
alter table pairing_members      enable row level security;
alter table games                enable row level security;
alter table game_scorer_handoffs enable row level security;
alter table game_participants    enable row level security;
alter table frames               enable row level security;

-- ============================================================================
-- STILL TO DO (later migrations, deliberately not built yet):
--   * RLS policies: who can read (likely: league members), who can write a
--     game (its current scorer), who can enter paper results (officers).
--     No policy should grant UPDATE/DELETE on game_scorer_handoffs.
--   * Stats views (standings, per-player ringer %, leaderboards). These are
--     SQL over the tables above; the attribution rule for subs is a WHERE/JOIN
--     decision made once the league settles it. Every stat must filter on
--     detail_level. The raw data already supports every option.
--   * Guest-merge procedure (fold a guest player into a real one).
--   * Possible further invariants, not yet decided:
--       - a game's team_a/b match its team_match's teams, and pairing_a/b
--         belong to team_a/b;
--       - team_matches.season_id matches its night's season;
--       - a pairing's team is one of its team match's teams;
--       - games.current_scorer_player_id kept in sync with the latest handoff.
-- ============================================================================
