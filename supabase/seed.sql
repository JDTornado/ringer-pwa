-- ============================================================================
-- Local seed data. Runs on every `supabase db reset`; NEVER on the hosted DB.
--
-- One season, one match night, one team match (Silver State Shoes vs
-- Truckee Tossers), all six pairings, and two of the night's games:
--   game 1: app-scored, frame-level, complete. Silver State wins 22-17 in
--           inning 9 (first to 21+).
--   game 2: paper sheet, final_only, complete. Truckee wins 21-18.
--
-- Subs: Silver State is short three players tonight, so Rick Alvarez roves in
-- from Washoe Ringers (capacity 'rover', home team Washoe). Truckee is short
-- too and fills with Gus Turner, an ad-hoc guest with no league history.
--
-- Fixed UUIDs so tests and ad-hoc queries can refer to rows. Pattern:
--   ...-0001-... players   ...-0002-... season    ...-0003-... teams
--   ...-0004-... night     ...-0005-... match     ...-0006-... pairings
--   ...-0007-... games     ...-0008-... game participants
-- ============================================================================

-- ---------- Players --------------------------------------------------------

insert into players (id, display_name, is_guest) values
  -- Silver State Shoes
  ('00000000-0000-0000-0001-0000000000a1', 'Alice Moreno',   false),
  ('00000000-0000-0000-0001-0000000000a2', 'Dan Kessler',    false),
  ('00000000-0000-0000-0001-0000000000a3', 'Priya Shah',     false),
  ('00000000-0000-0000-0001-0000000000a4', 'Tom Wexler',     false),
  ('00000000-0000-0000-0001-0000000000a5', 'Linda Ortiz',    false),
  ('00000000-0000-0000-0001-0000000000a6', 'Hank Bauer',     false),
  ('00000000-0000-0000-0001-0000000000a7', 'Joe Nakamura',   false),
  ('00000000-0000-0000-0001-0000000000a8', 'Ruth Ellison',   false),
  -- Truckee Tossers
  ('00000000-0000-0000-0001-0000000000b1', 'Bob Ferris',     false),
  ('00000000-0000-0000-0001-0000000000b2', 'Carla Diaz',     false),
  ('00000000-0000-0000-0001-0000000000b3', 'Ed Lindqvist',   false),
  ('00000000-0000-0000-0001-0000000000b4', 'Mae Porter',     false),
  ('00000000-0000-0000-0001-0000000000b5', 'Sam Whitlock',   false),
  ('00000000-0000-0000-0001-0000000000b6', 'Gina Rossi',     false),
  ('00000000-0000-0000-0001-0000000000b7', 'Walt Hughes',    false),
  ('00000000-0000-0000-0001-0000000000b8', 'Nora Quinn',     false),
  -- Washoe Ringers (only the rover is seeded from this team)
  ('00000000-0000-0000-0001-0000000000c1', 'Rick Alvarez',   false),
  -- Ad-hoc guest: name only, no team, no account
  ('00000000-0000-0000-0001-0000000000d1', 'Gus Turner',     true);

-- ---------- Season and teams -----------------------------------------------

insert into seasons (id, name, starts_on, ends_on) values
  ('00000000-0000-0000-0002-000000000001', 'Fall 2026', '2026-09-08', '2026-12-08');

insert into teams (id, season_id, name, captain_player_id) values
  ('00000000-0000-0000-0003-00000000000a', '00000000-0000-0000-0002-000000000001', 'Silver State Shoes', '00000000-0000-0000-0001-0000000000a1'),
  ('00000000-0000-0000-0003-00000000000b', '00000000-0000-0000-0002-000000000001', 'Truckee Tossers',    '00000000-0000-0000-0001-0000000000b1'),
  ('00000000-0000-0000-0003-00000000000c', '00000000-0000-0000-0002-000000000001', 'Washoe Ringers',     '00000000-0000-0000-0001-0000000000c1');

insert into team_memberships (season_id, team_id, player_id)
select '00000000-0000-0000-0002-000000000001', t.team_id, p.id
from players p
join (values ('a', '00000000-0000-0000-0003-00000000000a'::uuid),
             ('b', '00000000-0000-0000-0003-00000000000b'::uuid),
             ('c', '00000000-0000-0000-0003-00000000000c'::uuid)) as t(prefix, team_id)
  on right(p.id::text, 2) like t.prefix || '_'
where not p.is_guest;

-- ---------- Match night and team match -------------------------------------

insert into match_nights (id, season_id, played_on, venue, status) values
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0002-000000000001',
   '2026-10-27', 'Idlewild Park courts', 'in_progress');

insert into team_matches (id, night_id, season_id, team_a_id, team_b_id, status) values
  ('00000000-0000-0000-0005-000000000001', '00000000-0000-0000-0004-000000000001',
   '00000000-0000-0000-0002-000000000001',
   '00000000-0000-0000-0003-00000000000a', '00000000-0000-0000-0003-00000000000b',
   'in_progress');

-- ---------- Pairings (captains' intent for the night) ----------------------
-- Absent tonight: Hank, Joe, Ruth (Silver State); Gina, Walt, Nora (Truckee).

insert into pairings (id, team_match_id, team_id, slot) values
  ('00000000-0000-0000-0006-0000000000a1', '00000000-0000-0000-0005-000000000001', '00000000-0000-0000-0003-00000000000a', 1),
  ('00000000-0000-0000-0006-0000000000a2', '00000000-0000-0000-0005-000000000001', '00000000-0000-0000-0003-00000000000a', 2),
  ('00000000-0000-0000-0006-0000000000a3', '00000000-0000-0000-0005-000000000001', '00000000-0000-0000-0003-00000000000a', 3),
  ('00000000-0000-0000-0006-0000000000b1', '00000000-0000-0000-0005-000000000001', '00000000-0000-0000-0003-00000000000b', 1),
  ('00000000-0000-0000-0006-0000000000b2', '00000000-0000-0000-0005-000000000001', '00000000-0000-0000-0003-00000000000b', 2),
  ('00000000-0000-0000-0006-0000000000b3', '00000000-0000-0000-0005-000000000001', '00000000-0000-0000-0003-00000000000b', 3);

insert into pairing_members (pairing_id, player_id, capacity, home_team_id, court_end) values
  -- Silver State 1: Alice + rover Rick (home team Washoe Ringers)
  ('00000000-0000-0000-0006-0000000000a1', '00000000-0000-0000-0001-0000000000a1', 'roster', null, 'south'),
  ('00000000-0000-0000-0006-0000000000a1', '00000000-0000-0000-0001-0000000000c1', 'rover',  '00000000-0000-0000-0003-00000000000c', 'north'),
  -- Silver State 2: Dan + Priya
  ('00000000-0000-0000-0006-0000000000a2', '00000000-0000-0000-0001-0000000000a2', 'roster', null, 'south'),
  ('00000000-0000-0000-0006-0000000000a2', '00000000-0000-0000-0001-0000000000a3', 'roster', null, 'north'),
  -- Silver State 3: Tom + Linda
  ('00000000-0000-0000-0006-0000000000a3', '00000000-0000-0000-0001-0000000000a4', 'roster', null, 'south'),
  ('00000000-0000-0000-0006-0000000000a3', '00000000-0000-0000-0001-0000000000a5', 'roster', null, 'north'),
  -- Truckee 1: guest Gus + Bob
  ('00000000-0000-0000-0006-0000000000b1', '00000000-0000-0000-0001-0000000000d1', 'guest',  null, 'south'),
  ('00000000-0000-0000-0006-0000000000b1', '00000000-0000-0000-0001-0000000000b1', 'roster', null, 'north'),
  -- Truckee 2: Carla + Ed
  ('00000000-0000-0000-0006-0000000000b2', '00000000-0000-0000-0001-0000000000b2', 'roster', null, 'south'),
  ('00000000-0000-0000-0006-0000000000b2', '00000000-0000-0000-0001-0000000000b3', 'roster', null, 'north'),
  -- Truckee 3: Mae + Sam
  ('00000000-0000-0000-0006-0000000000b3', '00000000-0000-0000-0001-0000000000b4', 'roster', null, 'south'),
  ('00000000-0000-0000-0006-0000000000b3', '00000000-0000-0000-0001-0000000000b5', 'roster', null, 'north');

-- ---------- Games ----------------------------------------------------------
-- Round 1 runs two games at once; pairing 3 of each team sits out and keeps
-- score.

insert into games (
  id, client_game_id, team_match_id, team_a_id, team_b_id, pairing_a_id, pairing_b_id,
  round, court, source, detail_level, status,
  current_scorer_player_id, entered_by_player_id, rules,
  final_score_a, final_score_b, played_at, completed_at
) values
  -- Game 1: app-scored, frame by frame. Tom started scoring; Mae took over at inning 6.
  ('00000000-0000-0000-0007-000000000001', 'c0000000-0000-4000-8000-000000000001',
   '00000000-0000-0000-0005-000000000001',
   '00000000-0000-0000-0003-00000000000a', '00000000-0000-0000-0003-00000000000b',
   '00000000-0000-0000-0006-0000000000a1', '00000000-0000-0000-0006-0000000000b1',
   1, 1, 'app', 'frame', 'complete',
   '00000000-0000-0000-0001-0000000000b4', null,
   '{"targetPoints": 21, "shoeLimitInnings": 15, "tieAtLimit": "suddenDeath"}',
   null, null, '2026-10-27 18:30-07', '2026-10-27 19:05-07'),
  -- Game 2: kept on paper by Sam, typed in the next day by Linda. Final only.
  ('00000000-0000-0000-0007-000000000002', 'c0000000-0000-4000-8000-000000000002',
   '00000000-0000-0000-0005-000000000001',
   '00000000-0000-0000-0003-00000000000a', '00000000-0000-0000-0003-00000000000b',
   '00000000-0000-0000-0006-0000000000a2', '00000000-0000-0000-0006-0000000000b2',
   1, 2, 'paper', 'final_only', 'complete',
   '00000000-0000-0000-0001-0000000000b5', '00000000-0000-0000-0001-0000000000a5',
   '{"targetPoints": 21, "shoeLimitInnings": 15, "tieAtLimit": "suddenDeath"}',
   18, 21, '2026-10-27 18:30-07', '2026-10-27 19:10-07');

insert into game_scorer_handoffs (game_id, player_id, from_inning, handed_off_at) values
  ('00000000-0000-0000-0007-000000000001', '00000000-0000-0000-0001-0000000000a4', 1, '2026-10-27 18:30-07'),
  ('00000000-0000-0000-0007-000000000001', '00000000-0000-0000-0001-0000000000b4', 6, '2026-10-27 18:48-07');

-- ---------- Who actually played --------------------------------------------

insert into game_participants (id, game_id, player_id, side, home_team_id, capacity, court_end) values
  -- Game 1
  ('00000000-0000-0000-0008-000000000001', '00000000-0000-0000-0007-000000000001', '00000000-0000-0000-0001-0000000000a1', 'a', null, 'roster', 'south'),
  ('00000000-0000-0000-0008-000000000002', '00000000-0000-0000-0007-000000000001', '00000000-0000-0000-0001-0000000000c1', 'a', '00000000-0000-0000-0003-00000000000c', 'rover', 'north'),
  ('00000000-0000-0000-0008-000000000003', '00000000-0000-0000-0007-000000000001', '00000000-0000-0000-0001-0000000000d1', 'b', null, 'guest',  'south'),
  ('00000000-0000-0000-0008-000000000004', '00000000-0000-0000-0007-000000000001', '00000000-0000-0000-0001-0000000000b1', 'b', null, 'roster', 'north'),
  -- Game 2
  ('00000000-0000-0000-0008-000000000005', '00000000-0000-0000-0007-000000000002', '00000000-0000-0000-0001-0000000000a2', 'a', null, 'roster', 'south'),
  ('00000000-0000-0000-0008-000000000006', '00000000-0000-0000-0007-000000000002', '00000000-0000-0000-0001-0000000000a3', 'a', null, 'roster', 'north'),
  ('00000000-0000-0000-0008-000000000007', '00000000-0000-0000-0007-000000000002', '00000000-0000-0000-0001-0000000000b2', 'b', null, 'roster', 'south'),
  ('00000000-0000-0000-0008-000000000008', '00000000-0000-0000-0007-000000000002', '00000000-0000-0000-0001-0000000000b3', 'b', null, 'roster', 'north');

-- ---------- Game 1 frames --------------------------------------------------
-- South: Alice (a) vs Gus (b). North: Rick (a) vs Bob (b).
-- Every ringer combo is valid per the data-model table:
--   1 -> (0,0)|(1,1)   2 -> (0,0)   3 -> (1,0)|(2,1)   4 -> (1,0)   6 -> (2,0)
--   (scorer, opponent); no-score frames have equal counts (all dead).
-- Running total shown as A-B after each frame.

insert into frames (game_id, inning, court_end, thrower_a_participant_id, thrower_b_participant_id,
                    scoring_side, points, ringers_a, ringers_b)
select '00000000-0000-0000-0007-000000000001', f.inning, f.court_end::court_end,
       case f.court_end when 'south' then '00000000-0000-0000-0008-000000000001'::uuid
                        else '00000000-0000-0000-0008-000000000002'::uuid end,
       case f.court_end when 'south' then '00000000-0000-0000-0008-000000000003'::uuid
                        else '00000000-0000-0000-0008-000000000004'::uuid end,
       f.scoring_side::game_side, f.points, f.ringers_a, f.ringers_b
from (values
  (1, 'south', 'a',  3, 1, 0),   --  3-0   one live ringer
  (1, 'north', 'b',  1, 0, 0),   --  3-1
  (2, 'south', null, 0, 1, 1),   --  3-1   ringer each, both dead, no close
  (2, 'north', 'a',  2, 0, 0),   --  5-1
  (3, 'south', 'b',  3, 0, 1),   --  5-4
  (3, 'north', 'a',  1, 1, 1),   --  6-4   dead ringers + a close
  (4, 'south', 'b',  4, 0, 1),   --  6-8   ringer + close
  (4, 'north', 'a',  6, 2, 0),   -- 12-8   double ringer
  (5, 'south', null, 0, 0, 0),   -- 12-8
  (5, 'north', 'b',  3, 1, 2),   -- 12-11  two vs one: one live
  (6, 'south', 'a',  1, 0, 0),   -- 13-11
  (6, 'north', 'b',  2, 0, 0),   -- 13-13
  (7, 'south', 'a',  3, 1, 0),   -- 16-13
  (7, 'north', null, 0, 2, 2),   -- 16-13  four dead ringers
  (8, 'south', 'b',  1, 0, 0),   -- 16-14
  (8, 'north', 'a',  4, 1, 0),   -- 20-14
  (9, 'south', 'b',  3, 0, 1),   -- 20-17
  (9, 'north', 'a',  2, 0, 0)    -- 22-17  Silver State reaches 21+: game over
) as f(inning, court_end, scoring_side, points, ringers_a, ringers_b);
