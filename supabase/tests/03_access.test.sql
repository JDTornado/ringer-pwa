-- Access rules (RLS, guards, locking, audit, account linking), run as real
-- API users. Builds on supabase/seed.sql:
--   admin@ringer.test ...0009-...01  admin, linked to Alice (a1)
--   tom@ringer.test   ...0009-...02  member, linked to Tom (a4, Silver State)
--   mae@ringer.test   ...0009-...03  member, linked to Mae (b4, Truckee)
--   new@ringer.test   ...0009-...04  signed in, no player yet
-- Row counts from UPDATE/DELETE use a top-level data-modifying CTE: RLS
-- filters rows silently, so "0 rows changed" is how a USING denial shows up.
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

-- Switch the signed-in user (role stays whatever it is).
create schema t;
create function t.login(uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
grant usage on schema t to anon, authenticated;
grant execute on function t.login(text) to anon, authenticated;

-- ---------- Fixture (as postgres): tonight, not yet locked ------------------
insert into match_nights (id, season_id, played_on, venue, status, locks_at) values
  ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0002-000000000001',
   '2026-11-24', 'Idlewild Park courts', 'in_progress', now() + interval '1 day');
insert into team_matches (id, night_id, season_id, team_a_id, team_b_id, status) values
  ('00000000-0000-0000-0005-000000000002', '00000000-0000-0000-0004-000000000002',
   '00000000-0000-0000-0002-000000000001',
   '00000000-0000-0000-0003-00000000000a', '00000000-0000-0000-0003-00000000000b', 'in_progress');
insert into team_match_pits (night_id, team_match_id, pit) values
  ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0005-000000000002', 3),
  ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0005-000000000002', 4);

-- ============================================================================
-- Tom: a member
-- ============================================================================
select t.login('00000000-0000-0000-0009-000000000002');
set local role authenticated;

select ok((select count(*) from games) >= 2, 'a member reads league games');
select is((select count(*)::int from audit_log), 0, 'a member cannot read the audit log');
select is((select count(*)::int from admins), 0, 'a member cannot read the admin list');
select throws_ok(
  $$ insert into seasons (name) values ('Rogue season') $$,
  '42501', null, 'a member cannot create a season');
select lives_ok(
  $$ insert into players (id, display_name, is_guest) values
     ('00000000-0000-0000-0001-0000000000e1', 'Walk-in Willie', true) $$,
  'a member can add a guest player');
select throws_ok(
  $$ insert into players (display_name, is_guest) values ('Not a guest', false) $$,
  '42501', null, 'a member cannot add a non-guest player');
select lives_ok(
  $$ insert into pairings (id, team_match_id, team_id, slot) values
     ('00000000-0000-0000-0006-0000000000c1', '00000000-0000-0000-0005-000000000002', '00000000-0000-0000-0003-00000000000a', 1),
     ('00000000-0000-0000-0006-0000000000c2', '00000000-0000-0000-0005-000000000002', '00000000-0000-0000-0003-00000000000b', 1) $$,
  'a member can create pairings when a pair plays its first game');

-- Start an app game, as its scorer and enterer.
select lives_ok(
  $$ insert into games (id, client_game_id, night_id, team_match_id, team_a_id, team_b_id,
                        pairing_a_id, pairing_b_id, round, pit, source, status,
                        current_scorer_player_id, entered_by_player_id, rules)
     values ('00000000-0000-0000-0007-000000000003', 'c0000000-0000-4000-8000-000000000003',
             '00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0005-000000000002',
             '00000000-0000-0000-0003-00000000000a', '00000000-0000-0000-0003-00000000000b',
             '00000000-0000-0000-0006-0000000000c1', '00000000-0000-0000-0006-0000000000c2',
             1, 3, 'app', 'in_progress',
             '00000000-0000-0000-0001-0000000000a4', '00000000-0000-0000-0001-0000000000a4',
             '{"targetPoints": 21, "shoeLimitInnings": 15, "tieAtLimit": "suddenDeath"}') $$,
  'a member can start an app game as its scorer');
select results_eq(
  $$ select player_id::text, from_inning::int from game_scorer_handoffs
     where game_id = '00000000-0000-0000-0007-000000000003' $$,
  $$ values ('00000000-0000-0000-0001-0000000000a4', 1) $$,
  'the first scorer is logged as a handoff from inning 1');
select throws_ok(
  $$ insert into games (client_game_id, night_id, team_match_id, team_a_id, team_b_id, source,
                        current_scorer_player_id, entered_by_player_id, rules)
     values (gen_random_uuid(), '00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0005-000000000002',
             '00000000-0000-0000-0003-00000000000a', '00000000-0000-0000-0003-00000000000b', 'app',
             '00000000-0000-0000-0001-0000000000b4', '00000000-0000-0000-0001-0000000000a4', '{}') $$,
  '42501', null, 'a member cannot start an app game with someone else as scorer');
select throws_ok(
  $$ insert into games (client_game_id, night_id, team_match_id, team_a_id, team_b_id, source,
                        current_scorer_player_id, entered_by_player_id, rules)
     values (gen_random_uuid(), '00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0005-000000000002',
             '00000000-0000-0000-0003-00000000000a', '00000000-0000-0000-0003-00000000000b', 'app',
             '00000000-0000-0000-0001-0000000000a4', '00000000-0000-0000-0001-0000000000a5', '{}') $$,
  '42501', null, 'a member cannot record a game as entered by someone else');

select lives_ok(
  $$ insert into game_participants (id, game_id, player_id, side, capacity, court_end) values
       ('00000000-0000-0000-0008-000000000011', '00000000-0000-0000-0007-000000000003', '00000000-0000-0000-0001-0000000000a4', 'a', 'roster', 'south'),
       ('00000000-0000-0000-0008-000000000012', '00000000-0000-0000-0007-000000000003', '00000000-0000-0000-0001-0000000000a5', 'a', 'roster', 'north'),
       ('00000000-0000-0000-0008-000000000013', '00000000-0000-0000-0007-000000000003', '00000000-0000-0000-0001-0000000000b4', 'b', 'roster', 'south'),
       ('00000000-0000-0000-0008-000000000014', '00000000-0000-0000-0007-000000000003', '00000000-0000-0000-0001-0000000000b5', 'b', 'roster', 'north');
     insert into frames (game_id, inning, court_end, thrower_a_participant_id, thrower_b_participant_id,
                         scoring_side, points, ringers_a, ringers_b)
     values ('00000000-0000-0000-0007-000000000003', 1, 'south',
             '00000000-0000-0000-0008-000000000011', '00000000-0000-0000-0008-000000000013', 'a', 3, 1, 0) $$,
  'the scorer can add participants and frames');

with u as (update frames set points = 4 where game_id = '00000000-0000-0000-0007-000000000003' returning 1)
select is(count(*)::int, 1, 'the scorer can edit a frame') from u;
select throws_ok(
  $$ update games set locked_at = now() where id = '00000000-0000-0000-0007-000000000003' $$,
  '42501', null, 'the scorer cannot lock their own game');
select throws_ok(
  $$ update games set current_scorer_player_id = '00000000-0000-0000-0001-0000000000b4'
     where id = '00000000-0000-0000-0007-000000000003' $$,
  '42501', null, 'the scorer cannot change the scorer directly (handoff only)');
with u as (update games set status = 'in_progress', round = 2 where id = '00000000-0000-0000-0007-000000000003' returning 1)
select is(count(*)::int, 1, 'the scorer can edit their game''s own fields') from u;

-- ---------- Mae is a member but not the scorer -----------------------------
select t.login('00000000-0000-0000-0009-000000000003');
with u as (update frames set points = 6 where game_id = '00000000-0000-0000-0007-000000000003' returning 1)
select is(count(*)::int, 0, 'another member cannot edit the game''s frames') from u;
select throws_ok(
  $$ insert into frames (game_id, inning, court_end, thrower_a_participant_id, thrower_b_participant_id)
     values ('00000000-0000-0000-0007-000000000003', 1, 'north',
             '00000000-0000-0000-0008-000000000012', '00000000-0000-0000-0008-000000000014') $$,
  '42501', null, 'another member cannot add frames');

-- ---------- Handoff Tom -> Mae ---------------------------------------------
select t.login('00000000-0000-0000-0009-000000000002');
select lives_ok(
  $$ insert into game_scorer_handoffs (game_id, player_id, from_inning)
     values ('00000000-0000-0000-0007-000000000003', '00000000-0000-0000-0001-0000000000b4', 2) $$,
  'the scorer can hand the game off');
select is(
  (select current_scorer_player_id::text from games where id = '00000000-0000-0000-0007-000000000003'),
  '00000000-0000-0000-0001-0000000000b4', 'the handoff makes Mae the current scorer');
with u as (update frames set points = 6 where game_id = '00000000-0000-0000-0007-000000000003' returning 1)
select is(count(*)::int, 0, 'after handing off, Tom can no longer edit frames') from u;
with u as (update game_scorer_handoffs set from_inning = 3 where game_id = '00000000-0000-0000-0007-000000000003' returning 1)
select is(count(*)::int, 0, 'handoffs cannot be updated') from u;
with u as (delete from game_scorer_handoffs where game_id = '00000000-0000-0000-0007-000000000003' returning 1)
select is(count(*)::int, 0, 'handoffs cannot be deleted') from u;

select t.login('00000000-0000-0000-0009-000000000003');
with u as (update frames set points = 6, ringers_a = 2 where game_id = '00000000-0000-0000-0007-000000000003' returning 1)
select is(count(*)::int, 1, 'the new scorer can edit frames') from u;

-- ---------- The night locks ------------------------------------------------
reset role;
update match_nights set locks_at = now() where id = '00000000-0000-0000-0004-000000000002';
select t.login('00000000-0000-0000-0009-000000000003');
set local role authenticated;

with u as (update frames set points = 3 where game_id = '00000000-0000-0000-0007-000000000003' returning 1)
select is(count(*)::int, 0, 'after the night locks, the scorer cannot edit frames') from u;
select throws_ok(
  $$ insert into frames (game_id, inning, court_end, thrower_a_participant_id, thrower_b_participant_id)
     values ('00000000-0000-0000-0007-000000000003', 1, 'north',
             '00000000-0000-0000-0008-000000000012', '00000000-0000-0000-0008-000000000014') $$,
  '42501', null, 'after the night locks, the scorer cannot add frames');
select throws_ok(
  $$ insert into game_scorer_handoffs (game_id, player_id, from_inning)
     values ('00000000-0000-0000-0007-000000000003', '00000000-0000-0000-0001-0000000000a4', 3) $$,
  '42501', null, 'after the night locks, the scorer cannot hand off');
select throws_ok(
  $$ insert into games (client_game_id, night_id, team_match_id, team_a_id, team_b_id, source,
                        current_scorer_player_id, entered_by_player_id, rules)
     values (gen_random_uuid(), '00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0005-000000000002',
             '00000000-0000-0000-0003-00000000000a', '00000000-0000-0000-0003-00000000000b', 'app',
             '00000000-0000-0000-0001-0000000000b4', '00000000-0000-0000-0001-0000000000b4', '{}') $$,
  '42501', null, 'no new app games on a locked night');

-- ---------- Paper entry after the night ------------------------------------
select t.login('00000000-0000-0000-0009-000000000002');
select lives_ok(
  $$ insert into games (id, client_game_id, night_id, team_match_id, team_a_id, team_b_id, source,
                        detail_level, status, current_scorer_player_id, entered_by_player_id, rules,
                        final_score_a, final_score_b)
     values ('00000000-0000-0000-0007-000000000004', 'c0000000-0000-4000-8000-000000000004',
             '00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0005-000000000002',
             '00000000-0000-0000-0003-00000000000a', '00000000-0000-0000-0003-00000000000b', 'paper',
             'final_only', 'complete', '00000000-0000-0000-0001-0000000000b5',
             '00000000-0000-0000-0001-0000000000a4', '{}', 21, 12) $$,
  'a member can enter a paper game after the night locks');
with u as (update games set final_score_b = 13 where id = '00000000-0000-0000-0007-000000000004' returning 1)
select is(count(*)::int, 1, 'the enterer can correct their paper game') from u;
with u as (delete from games where id = '00000000-0000-0000-0007-000000000004' returning 1)
select is(count(*)::int, 0, 'a member cannot delete a game') from u;
select t.login('00000000-0000-0000-0009-000000000003');
with u as (update games set final_score_b = 14 where id = '00000000-0000-0000-0007-000000000004' returning 1)
select is(count(*)::int, 0, 'another member cannot edit someone else''s paper game') from u;

-- ============================================================================
-- Admin
-- ============================================================================
select t.login('00000000-0000-0000-0009-000000000001');
with u as (update frames set points = 3, ringers_a = 1 where game_id = '00000000-0000-0000-0007-000000000003' returning 1)
select is(count(*)::int, 1, 'an admin can edit a frame in a locked game') from u;
select ok(
  exists (select 1 from audit_log where table_name = 'frames' and action = 'UPDATE'
          and game_id = '00000000-0000-0000-0007-000000000003'
          and actor_user_id = '00000000-0000-0000-0009-000000000001'
          and old_row ->> 'points' = '6' and new_row ->> 'points' = '3'),
  'the audit log records the admin''s edit: who, what, before and after');
select lives_ok(
  $$ insert into frames (game_id, inning, court_end, thrower_a_participant_id, thrower_b_participant_id)
     values ('00000000-0000-0000-0007-000000000003', 1, 'north',
             '00000000-0000-0000-0008-000000000012', '00000000-0000-0000-0008-000000000014') $$,
  'an admin can add a frame to a locked game');
select ok(
  exists (select 1 from audit_log where table_name = 'frames' and action = 'INSERT'
          and game_id = '00000000-0000-0000-0007-000000000003'),
  'an insert into a locked game is audited');
with u as (update games set locked_at = now() where id = '00000000-0000-0000-0007-000000000004' returning 1)
select is(count(*)::int, 1, 'an admin can lock a single game') from u;

select t.login('00000000-0000-0000-0009-000000000002');
with u as (update games set final_score_b = 15 where id = '00000000-0000-0000-0007-000000000004' returning 1)
select is(count(*)::int, 0, 'once an admin locks a paper game, its enterer cannot edit it') from u;

-- ============================================================================
-- Account -> player link
-- ============================================================================
with u as (update players set auth_user_id = null where id = '00000000-0000-0000-0001-0000000000a4' returning 1)
select is(count(*)::int, 0, 'a member cannot change their own account link') from u;
select throws_ok(
  $$ select claim_player('00000000-0000-0000-0001-0000000000a6') $$,
  '42501', null, 'an already-linked account cannot claim another player');

select t.login('00000000-0000-0000-0009-000000000004');
select throws_ok(
  $$ select claim_player('00000000-0000-0000-0001-0000000000d1') $$,
  '42501', null, 'a guest cannot be claimed');
select throws_ok(
  $$ select claim_player('00000000-0000-0000-0001-0000000000a4') $$,
  '42501', null, 'a player linked to another account cannot be claimed');
select lives_ok(
  $$ select claim_player('00000000-0000-0000-0001-0000000000a6') $$,
  'a new account can claim its player once');
select ok((select count(*) from games) >= 2, 'after claiming, the account is a member and reads games');
select throws_ok(
  $$ select claim_player('00000000-0000-0000-0001-0000000000a7') $$,
  '42501', null, 'once linked, the account cannot claim again');

select t.login('00000000-0000-0000-0009-000000000001');
with u as (update players set auth_user_id = null where id = '00000000-0000-0000-0001-0000000000a6' returning 1)
select is(count(*)::int, 1, 'an admin can change an account link') from u;

reset role;
set local role anon;
select throws_ok(
  $$ select claim_player('00000000-0000-0000-0001-0000000000a7') $$,
  '42501', null, 'anon cannot claim a player');
reset role;

select * from finish();
rollback;
