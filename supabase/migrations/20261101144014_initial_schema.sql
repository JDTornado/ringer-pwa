-- ============================================================================
-- Horseshoe League: initial schema (Supabase / Postgres)
--
-- Implements docs/data-model.md (rules and meaning). Workflow: docs/database.md.
-- Structure, integrity constraints, one derived view (game_scores), and RLS
-- enabled on every table. Access policies are in the next migration; stats
-- views and standings come later.
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
-- locks_at: when this night's app-scored games lock (end of night). Admins set
-- it when scheduling and can set it to now() to lock early. NULL = not yet
-- scheduled to lock. After it passes, only admins can change those games
-- (see the access migration).

create table match_nights (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references seasons (id) on delete cascade,
  played_on   date not null,
  venue       text,
  status      entity_status not null default 'scheduled',
  locks_at    timestamptz,
  created_at  timestamptz not null default now(),
  -- Target for team_matches' composite FK (match season = night season).
  unique (id, season_id)
);

-- ---------- Team matches (Team A vs Team B on a night; the schedule) --------

create table team_matches (
  id          uuid primary key default gen_random_uuid(),
  night_id    uuid not null,
  season_id   uuid not null references seasons (id),        -- denormalized for queries
  team_a_id   uuid not null,
  team_b_id   uuid not null,
  status      entity_status not null default 'scheduled',
  created_at  timestamptz not null default now(),
  constraint team_matches_teams_differ check (team_a_id <> team_b_id),
  -- The night must be in the match's season.
  constraint team_matches_night_season_fk
    foreign key (night_id, season_id) references match_nights (id, season_id) on delete cascade,
  -- Both teams must belong to the match's season.
  constraint team_matches_team_a_season_fk
    foreign key (team_a_id, season_id) references teams (id, season_id),
  constraint team_matches_team_b_season_fk
    foreign key (team_b_id, season_id) references teams (id, season_id),
  -- Targets for composite FKs from pits and games.
  unique (id, night_id),
  unique (id, night_id, team_a_id, team_b_id)
);

-- ---------- Pit assignments ------------------------------------------------
-- The pits a team match uses on its night (two games run at once, so usually
-- two). A pit can't be given to two team matches on the same night.

create table team_match_pits (
  id            uuid primary key default gen_random_uuid(),
  night_id      uuid not null,
  team_match_id uuid not null,
  pit           smallint not null check (pit >= 1),
  created_at    timestamptz not null default now(),
  unique (night_id, pit),
  unique (team_match_id, pit),
  constraint team_match_pits_match_night_fk
    foreign key (team_match_id, night_id) references team_matches (id, night_id) on delete cascade
);

-- ---------- Pairings (a team's pair for the night; a label) ----------------
-- Each team fields 3 pairings a night; each plays the 3 opposing pairings
-- (a 3x3 grid of 9 games). A pairing is just the label for a grid row or
-- column: team match + team + slot. The app creates it when a pair plays
-- its first game. WHO played is recorded on each game (game_participants),
-- never on the pairing, so subs and early leavers need no pairing edits.
-- An admin fixes a mislabeled game by pointing it at the right pairing.

create table pairings (
  id            uuid primary key default gen_random_uuid(),
  team_match_id uuid not null references team_matches (id) on delete cascade,
  team_id       uuid not null references teams (id),
  slot          smallint not null check (slot between 1 and 3),
  created_at    timestamptz not null default now(),
  unique (team_match_id, team_id, slot),
  -- Target for games' composite FKs (pairing belongs to the game's match and side).
  unique (id, team_match_id, team_id)
);

-- A pairing's team must be one of its team match's two teams.
create function public.pairings_check_team()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.team_matches m
    where m.id = new.team_match_id and new.team_id in (m.team_a_id, m.team_b_id)
  ) then
    raise exception 'pairing team % is not in team match %', new.team_id, new.team_match_id
      using errcode = 'foreign_key_violation', constraint = 'pairings_team_in_match';
  end if;
  return null;
end;
$$;

-- An AFTER (constraint) trigger, so RLS rejects a client insert before this runs.
create constraint trigger pairings_team_in_match
  after insert or update on pairings
  for each row execute function public.pairings_check_team();

-- ---------- Games ----------------------------------------------------------

create table games (
  id                       uuid primary key default gen_random_uuid(),
  -- Device-generated on creation; makes offline creation idempotent so a
  -- retried sync can't produce a duplicate game.
  client_game_id           uuid not null unique,
  -- The match night and team match. Both NULL for a game outside the league
  -- schedule; a team-match game always records its night too.
  night_id                 uuid references match_nights (id) on delete cascade,
  team_match_id            uuid,
  -- Every stored game uses real team rows. Side 'a' = team_a, side 'b' = team_b.
  -- In a team match these are the match's team A and team B, in that order.
  team_a_id                uuid not null references teams (id),
  team_b_id                uuid not null references teams (id),
  -- The 3x3 grid cell: side A's pairing vs side B's pairing. A label only;
  -- who actually played is in game_participants.
  pairing_a_id             uuid,
  pairing_b_id             uuid,
  round                    smallint,
  pit                      smallint,
  source                   game_source       not null default 'app',
  detail_level             game_detail_level not null default 'frame',
  status                   entity_status     not null default 'scheduled',
  -- Who holds the game right now. Mutable; history is in game_scorer_handoffs.
  current_scorer_player_id uuid references players (id),
  -- Who created this record: the scorer who started an app game, or who
  -- typed in a paper sheet (distinct from who kept score on paper).
  entered_by_player_id     uuid references players (id),
  -- Snapshot of the rules this game was played under (endCondition etc.).
  rules                    jsonb not null check (jsonb_typeof(rules) = 'object'),
  -- ONLY for final_only games, where the final is all the sheet has. For
  -- frame games these are NULL and the score is derived (see game_scores).
  final_score_a            integer check (final_score_a >= 0),
  final_score_b            integer check (final_score_b >= 0),
  played_at                timestamptz,
  completed_at             timestamptz,
  -- Admin lock for this one game. An app game also locks when its night's
  -- locks_at passes (see the access migration).
  locked_at                timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint games_teams_differ check (team_a_id <> team_b_id),
  -- A team-match game records its night (the composite FK below needs both;
  -- with a NULL night it would silently not be checked).
  constraint games_team_match_has_night check (team_match_id is null or night_id is not null),
  -- Pairings and pits only exist inside a team match.
  constraint games_pairings_need_team_match check (
    team_match_id is not null or (pairing_a_id is null and pairing_b_id is null)
  ),
  constraint games_pit_needs_team_match check (team_match_id is not null or pit is null),
  -- The game's night and teams are its team match's (side a = match team A).
  constraint games_team_match_fk
    foreign key (team_match_id, night_id, team_a_id, team_b_id)
    references team_matches (id, night_id, team_a_id, team_b_id) on delete cascade,
  -- Side A's pairing is team A's pairing in this match; same for B.
  constraint games_pairing_a_fk
    foreign key (pairing_a_id, team_match_id, team_a_id) references pairings (id, team_match_id, team_id),
  constraint games_pairing_b_fk
    foreign key (pairing_b_id, team_match_id, team_b_id) references pairings (id, team_match_id, team_id),
  -- The pit is one assigned to this team match.
  constraint games_pit_fk
    foreign key (team_match_id, pit) references team_match_pits (team_match_id, pit),
  constraint games_final_scores_by_detail_level check (
    case detail_level
      when 'frame' then final_score_a is null and final_score_b is null
      -- final_only: both entered, or neither yet (e.g. created before entry;
      -- once complete, both are required: see the next constraint).
      else (final_score_a is null) = (final_score_b is null)
    end
  ),
  -- A finished paper game must have its result entered.
  constraint games_complete_final_only_has_scores check (
    detail_level <> 'final_only' or status <> 'complete'
    or (final_score_a is not null and final_score_b is not null)
  ),
  -- Target for frames' composite FK (see frames: "a final_only game has no frames").
  unique (id, detail_level)
);

create trigger games_set_updated_at
  before update on games
  for each row execute function public.set_updated_at();

-- Each grid cell (pairing vs pairing) is played once. A voided game frees
-- its cell for a replay.
create unique index games_one_per_grid_cell
  on games (pairing_a_id, pairing_b_id)
  where status <> 'voided' and pairing_a_id is not null and pairing_b_id is not null;

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
create index on games (team_match_id);
create index on games (night_id);
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
alter table team_match_pits      enable row level security;
alter table pairings             enable row level security;
alter table games                enable row level security;
alter table game_scorer_handoffs enable row level security;
alter table game_participants    enable row level security;
alter table frames               enable row level security;

-- ============================================================================
-- STILL TO DO (later migrations, deliberately not built yet):
--   * Roles, RLS policies, locking and the audit log are in the next
--     migration (*_access_and_audit.sql).
--   * Stats views (standings, per-player ringer %, leaderboards). These are
--     SQL over the tables above; the attribution rule for subs is a WHERE/JOIN
--     decision made once the league settles it. Every stat must filter on
--     detail_level. The raw data already supports every option.
--   * Possible further invariant, not yet decided: a team plays at most one
--     team match per night.
-- ============================================================================
