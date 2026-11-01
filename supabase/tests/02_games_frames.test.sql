-- Games, participants, frames, the game_scores view, triggers.
-- One test per "Schema checks" item in docs/database.md, plus the extra
-- invariants the initial migration adds.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- ---------- Fixture --------------------------------------------------------
insert into seasons (id, name) values ('11111111-0000-0000-0000-000000000001', 'S1');
insert into teams (id, season_id, name) values
  ('22222222-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000001', 'Team A'),
  ('22222222-0000-0000-0000-00000000000b', '11111111-0000-0000-0000-000000000001', 'Team B');
insert into players (id, display_name) values
  ('33333333-0000-0000-0000-000000000001', 'A south'),
  ('33333333-0000-0000-0000-000000000002', 'A north'),
  ('33333333-0000-0000-0000-000000000003', 'B south'),
  ('33333333-0000-0000-0000-000000000004', 'B north'),
  ('33333333-0000-0000-0000-000000000005', 'A replacement');

-- G1: frame game (the one under test). G2: another frame game. F: final_only.
insert into games (id, client_game_id, team_a_id, team_b_id, detail_level, rules, final_score_a, final_score_b) values
  ('77777777-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
   '22222222-0000-0000-0000-00000000000a', '22222222-0000-0000-0000-00000000000b', 'frame', '{}', null, null),
  ('77777777-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000002',
   '22222222-0000-0000-0000-00000000000a', '22222222-0000-0000-0000-00000000000b', 'frame', '{}', null, null),
  ('77777777-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000003',
   '22222222-0000-0000-0000-00000000000a', '22222222-0000-0000-0000-00000000000b', 'final_only', '{}', 21, 15);

insert into game_participants (id, game_id, player_id, side, court_end) values
  -- G1
  ('88888888-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', 'a', 'south'),
  ('88888888-0000-0000-0000-000000000002', '77777777-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000002', 'a', 'north'),
  ('88888888-0000-0000-0000-000000000003', '77777777-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000003', 'b', 'south'),
  ('88888888-0000-0000-0000-000000000004', '77777777-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000004', 'b', 'north'),
  -- G2
  ('88888888-0000-0000-0000-000000000005', '77777777-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000001', 'a', 'south'),
  ('88888888-0000-0000-0000-000000000006', '77777777-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000003', 'b', 'south'),
  -- F
  ('88888888-0000-0000-0000-000000000007', '77777777-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000001', 'a', 'south'),
  ('88888888-0000-0000-0000-000000000008', '77777777-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000003', 'b', 'south');

-- Insert one frame. Throwers are participant ids; game defaults to G1.
create function pg_temp.frame(
  p_inning int, p_end text, p_thrower_a text, p_thrower_b text,
  p_side text, p_points int, p_ra int, p_rb int,
  p_game text default '77777777-0000-0000-0000-000000000001'
) returns void language sql as $$
  insert into public.frames (game_id, inning, court_end, thrower_a_participant_id, thrower_b_participant_id,
                             scoring_side, points, ringers_a, ringers_b)
  values (p_game::uuid, p_inning, p_end::public.court_end, p_thrower_a::uuid, p_thrower_b::uuid,
          p_side::public.game_side, p_points, p_ra, p_rb);
$$;

-- Shorthand participant ids.
--   AS = ...01  AN = ...02  BS = ...03  BN = ...04   (G1)
--   G2a = ...05 G2b = ...06                          (G2)
--   Fa = ...07  Fb = ...08                           (F)

-- ---------- Valid frames (inserted out of play order on purpose) -----------
select lives_ok($$
  select pg_temp.frame(3, 'north', '88888888-0000-0000-0000-000000000002', '88888888-0000-0000-0000-000000000004', 'a', 1, 1, 1);
  select pg_temp.frame(1, 'north', '88888888-0000-0000-0000-000000000002', '88888888-0000-0000-0000-000000000004', 'b', 3, 1, 2);
  select pg_temp.frame(2, 'south', '88888888-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000003', null, 0, 2, 2);
  select pg_temp.frame(1, 'south', '88888888-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000003', 'a', 3, 1, 0);
  select pg_temp.frame(3, 'south', '88888888-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000003', 'b', 4, 0, 1);
  select pg_temp.frame(2, 'north', '88888888-0000-0000-0000-000000000002', '88888888-0000-0000-0000-000000000004', 'a', 6, 2, 0);
  select pg_temp.frame(4, 'south', '88888888-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000003', 'b', 2, 0, 0);
$$, 'valid frames insert (points 0,1,2,3,4,6; ringers 0-2)');

-- ---------- Ringer range ---------------------------------------------------
select throws_like(
  $$ select pg_temp.frame(9, 'south', '88888888-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000003', 'a', 6, 3, 0) $$,
  '%"frames_ringers_a_check"%', 'ringers_a of 3 is rejected');
select throws_like(
  $$ select pg_temp.frame(9, 'south', '88888888-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000003', 'a', 3, 1, -1) $$,
  '%"frames_ringers_b_check"%', 'ringers_b of -1 is rejected');

-- ---------- Points vs scoring side -----------------------------------------
select throws_like(
  $$ select pg_temp.frame(9, 'south', '88888888-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000003', null, 2, 0, 0) $$,
  '%"frames_points_match_scoring_side"%', 'a no-score frame with points > 0 is rejected');
select throws_like(
  $$ select pg_temp.frame(9, 'south', '88888888-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000003', 'a', 0, 0, 0) $$,
  '%"frames_points_match_scoring_side"%', 'a scoring frame with 0 points is rejected');
select throws_like(
  $$ select pg_temp.frame(9, 'south', '88888888-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000003', 'a', 5, 1, 0) $$,
  '%"frames_points_check"%', '5 points is rejected');
select throws_like(
  $$ select pg_temp.frame(9, 'south', '88888888-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000003', 'a', 7, 2, 0) $$,
  '%"frames_points_check"%', '7 points is rejected');
select throws_like(
  $$ update frames set points = 5 where game_id = '77777777-0000-0000-0000-000000000001' and inning = 1 and court_end = 'south' $$,
  '%"frames_points_check"%', 'updating a frame to 5 points is rejected');

-- ---------- Dead ringers (derived) -----------------------------------------
select is_empty(
  $$ select id from frames where dead_ringers is distinct from least(ringers_a, ringers_b) $$,
  'dead_ringers = least(ringers_a, ringers_b) on every frame');
select results_eq(
  $$ select dead_ringers::int from frames where game_id = '77777777-0000-0000-0000-000000000001'
     order by inning, court_end $$,
  $$ values (0), (1), (2), (0), (0), (1), (0) $$,
  'dead_ringers has the expected values (e.g. 2 vs 1 -> 1, 2 vs 2 -> 2)');
select throws_ok(
  $$ insert into frames (game_id, inning, court_end, thrower_a_participant_id, thrower_b_participant_id, dead_ringers)
     values ('77777777-0000-0000-0000-000000000001', 9, 'south',
             '88888888-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000003', 1) $$,
  '428C9', null, 'dead_ringers cannot be written directly');
select lives_ok(
  $$ update frames set ringers_b = 1 where game_id = '77777777-0000-0000-0000-000000000001' and inning = 2 and court_end = 'south';
     update frames set ringers_b = 2 where game_id = '77777777-0000-0000-0000-000000000001' and inning = 2 and court_end = 'south' $$,
  'editing ringers in place is allowed');
select is(
  (select dead_ringers::int from frames where game_id = '77777777-0000-0000-0000-000000000001' and inning = 2 and court_end = 'south'),
  2, 'dead_ringers recomputes after an edit');

-- ---------- One frame per game + inning + end ------------------------------
select throws_like(
  $$ select pg_temp.frame(1, 'south', '88888888-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000003', 'a', 1, 0, 0) $$,
  '%"frames_game_id_inning_court_end_key"%', 'a second frame for the same game, inning, and end is rejected');

-- ---------- Play order -----------------------------------------------------
-- Columns are qualified: a bare "court_end" in ORDER BY would bind to the
-- court_end::text output column and sort alphabetically (north first).
select results_eq(
  $$ select inning::int, court_end::text from frames
     where game_id = '77777777-0000-0000-0000-000000000001'
     order by frames.inning, frames.court_end $$,
  $$ values (1, 'south'), (1, 'north'), (2, 'south'), (2, 'north'), (3, 'south'), (3, 'north'), (4, 'south') $$,
  'ORDER BY inning, court_end is play order (south first)');

-- ---------- Throwers belong to this game, on the right side ----------------
select throws_like(
  $$ select pg_temp.frame(5, 'south', '88888888-0000-0000-0000-000000000003', '88888888-0000-0000-0000-000000000003', 'a', 1, 0, 0) $$,
  '%"frames_thrower_a_fk"%', 'thrower A must be a side-a participant (side-b player rejected)');
select throws_like(
  $$ select pg_temp.frame(5, 'south', '88888888-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000001', 'a', 1, 0, 0) $$,
  '%"frames_thrower_b_fk"%', 'thrower B must be a side-b participant (side-a player rejected)');
select throws_like(
  $$ select pg_temp.frame(5, 'south', '88888888-0000-0000-0000-000000000005', '88888888-0000-0000-0000-000000000003', 'a', 1, 0, 0) $$,
  '%"frames_thrower_a_fk"%', 'thrower A must be a participant of the same game');
select throws_like(
  $$ select pg_temp.frame(5, 'south', '88888888-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000006', 'a', 1, 0, 0) $$,
  '%"frames_thrower_b_fk"%', 'thrower B must be a participant of the same game');
select throws_like(
  $$ update game_participants set side = 'b' where id = '88888888-0000-0000-0000-000000000001' $$,
  '%"frames_thrower_a_fk"%', 'a participant who threw frames cannot be moved to the other side');
select throws_like(
  $$ update game_participants set game_id = '77777777-0000-0000-0000-000000000002' where id = '88888888-0000-0000-0000-000000000002' $$,
  '%"frames_thrower_a_fk"%', 'a participant who threw frames cannot be moved to another game');

-- A side may have more than 2 participants (early-leaver replacement).
select lives_ok($$
  insert into game_participants (id, game_id, player_id, side, court_end, capacity) values
    ('88888888-0000-0000-0000-000000000009', '77777777-0000-0000-0000-000000000001',
     '33333333-0000-0000-0000-000000000005', 'a', 'north', 'sub_pool');
  select pg_temp.frame(4, 'north', '88888888-0000-0000-0000-000000000009', '88888888-0000-0000-0000-000000000004', null, 0, 0, 0);
$$, 'a third side-a participant (replacement) can be added and throw a frame');

-- ---------- detail_level: finals vs frames ---------------------------------
select throws_like(
  $$ update games set final_score_a = 10, final_score_b = 9 where id = '77777777-0000-0000-0000-000000000001' $$,
  '%"games_final_scores_by_detail_level"%', 'a frame-level game cannot have final scores');
select throws_like(
  $$ update games set final_score_b = null where id = '77777777-0000-0000-0000-000000000003' $$,
  '%"games_final_scores_by_detail_level"%', 'a final_only game has both finals or neither');
select throws_like(
  $$ insert into games (client_game_id, team_a_id, team_b_id, detail_level, status, rules) values
     (gen_random_uuid(), '22222222-0000-0000-0000-00000000000a', '22222222-0000-0000-0000-00000000000b',
      'final_only', 'complete', '{}') $$,
  '%"games_complete_final_only_has_scores"%', 'a complete final_only game must have both final scores');
select throws_like(
  $$ select pg_temp.frame(1, 'south', '88888888-0000-0000-0000-000000000007', '88888888-0000-0000-0000-000000000008', 'a', 1, 0, 0,
                          '77777777-0000-0000-0000-000000000003') $$,
  '%"frames_game_is_frame_level_fk"%', 'a final_only game cannot have frames');
select throws_like(
  $$ update games set detail_level = 'final_only' where id = '77777777-0000-0000-0000-000000000001' $$,
  '%"frames_game_is_frame_level_fk"%', 'a game with frames cannot be switched to final_only');

-- ---------- games: identity and required fields ----------------------------
select throws_like(
  $$ insert into games (client_game_id, team_a_id, team_b_id, rules) values
     ('cccccccc-0000-0000-0000-000000000001', '22222222-0000-0000-0000-00000000000a', '22222222-0000-0000-0000-00000000000b', '{}') $$,
  '%"games_client_game_id_key"%', 'a duplicate client_game_id is rejected');
select throws_like(
  $$ insert into games (client_game_id, team_a_id, team_b_id, rules) values
     (gen_random_uuid(), '22222222-0000-0000-0000-00000000000a', '22222222-0000-0000-0000-00000000000a', '{}') $$,
  '%"games_teams_differ"%', 'a game''s two teams must differ');
select throws_ok(
  $$ insert into games (client_game_id, team_a_id, team_b_id) values
     (gen_random_uuid(), '22222222-0000-0000-0000-00000000000a', '22222222-0000-0000-0000-00000000000b') $$,
  '23502', null, 'games.rules is required');
select throws_like(
  $$ insert into games (client_game_id, team_a_id, team_b_id, rules) values
     (gen_random_uuid(), '22222222-0000-0000-0000-00000000000a', '22222222-0000-0000-0000-00000000000b', '"21"') $$,
  '%"games_rules_check"%', 'games.rules must be a JSON object');

-- ---------- game_scores view -----------------------------------------------
-- G1: a = 3 + 6 + 1 = 10, b = 3 + 4 + 2 = 9 (plus a 0-point replacement frame).
select results_eq(
  $$ select game_id::text, detail_level::text, score_a, score_b from game_scores
     where game_id in ('77777777-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000002',
                       '77777777-0000-0000-0000-000000000003')
     order by game_id $$,
  $$ values ('77777777-0000-0000-0000-000000000001', 'frame',      10, 9),
            ('77777777-0000-0000-0000-000000000002', 'frame',       0, 0),
            ('77777777-0000-0000-0000-000000000003', 'final_only', 21, 15) $$,
  'game_scores: frame games sum frame points per side (0 with no frames); final_only uses the stored finals');
select ok(
  (select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.game_scores'::regclass),
  'game_scores is created with security_invoker = true');

-- ---------- updated_at triggers --------------------------------------------
-- now() is fixed for the whole transaction, so backdate first, then update.
update games set updated_at = '2000-01-01' where id = '77777777-0000-0000-0000-000000000002';
update games set court = 3 where id = '77777777-0000-0000-0000-000000000002';
select is((select updated_at from games where id = '77777777-0000-0000-0000-000000000002'), now(),
  'games.updated_at is set on update');
update frames set updated_at = '2000-01-01' where game_id = '77777777-0000-0000-0000-000000000001' and inning = 1 and court_end = 'south';
update frames set ringers_a = 1 where game_id = '77777777-0000-0000-0000-000000000001' and inning = 1 and court_end = 'south';
select is((select updated_at from frames where game_id = '77777777-0000-0000-0000-000000000001' and inning = 1 and court_end = 'south'), now(),
  'frames.updated_at is set on update');

-- ---------- Scorer handoffs: append-only -----------------------------------
insert into game_scorer_handoffs (game_id, player_id, from_inning) values
  ('77777777-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000002', 1);
select throws_like(
  $$ update game_scorer_handoffs set from_inning = 2 where game_id = '77777777-0000-0000-0000-000000000001' $$,
  '%append-only%', 'scorer handoffs cannot be updated');

-- ---------- Deleting a game cascades cleanly -------------------------------
select lives_ok(
  $$ delete from games where id = '77777777-0000-0000-0000-000000000001' $$,
  'deleting a game with participants, frames, and handoffs succeeds');
select is(
  (select count(*)::int from frames where game_id = '77777777-0000-0000-0000-000000000001')
  + (select count(*)::int from game_participants where game_id = '77777777-0000-0000-0000-000000000001')
  + (select count(*)::int from game_scorer_handoffs where game_id = '77777777-0000-0000-0000-000000000001'),
  0, 'its frames, participants, and handoffs are gone');

select * from finish();
rollback;
