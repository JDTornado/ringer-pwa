-- Players, teams, memberships, team matches, pairings: season and identity rules.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into seasons (id, name) values
  ('11111111-0000-0000-0000-000000000001', 'S1'),
  ('11111111-0000-0000-0000-000000000002', 'S2');
insert into teams (id, season_id, name) values
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'T1 (S1)'),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'T2 (S1)'),
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', 'T3 (S2)');
insert into players (id, display_name) values
  ('33333333-0000-0000-0000-000000000001', 'P1'),
  ('33333333-0000-0000-0000-000000000002', 'P2');
insert into team_memberships (season_id, team_id, player_id) values
  ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001');
insert into match_nights (id, season_id, played_on) values
  ('44444444-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', '2026-10-01');

-- A player can't be on two teams in the same season.
select throws_like(
  $$ insert into team_memberships (season_id, team_id, player_id) values
     ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000001') $$,
  '%"team_memberships_season_id_player_id_key"%',
  'a player cannot be on two teams in the same season'
);

select lives_ok(
  $$ insert into team_memberships (season_id, team_id, player_id) values
     ('11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000001') $$,
  'the same player can be on a team in a different season'
);

-- A membership can't point at a team from another season.
select throws_like(
  $$ insert into team_memberships (season_id, team_id, player_id) values
     ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000002') $$,
  '%"team_memberships_team_season_fk"%',
  'a membership cannot reference a team from a different season'
);

-- A team match can't involve a team from another season (either side).
select throws_like(
  $$ insert into team_matches (night_id, season_id, team_a_id, team_b_id) values
     ('44444444-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
      '22222222-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000001') $$,
  '%"team_matches_team_a_season_fk"%',
  'a team match cannot use a team A from a different season'
);
select throws_like(
  $$ insert into team_matches (night_id, season_id, team_a_id, team_b_id) values
     ('44444444-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
      '22222222-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000003') $$,
  '%"team_matches_team_b_season_fk"%',
  'a team match cannot use a team B from a different season'
);
select throws_like(
  $$ insert into team_matches (night_id, season_id, team_a_id, team_b_id) values
     ('44444444-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
      '22222222-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001') $$,
  '%"team_matches_teams_differ"%',
  'a team cannot play itself in a team match'
);

-- A player can't be merged into themselves.
select throws_like(
  $$ update players set merged_into_player_id = id where id = '33333333-0000-0000-0000-000000000002' $$,
  '%"players_not_merged_into_self"%',
  'a player cannot be merged into themselves'
);

-- ---------- Schedule: nights, matches, pits --------------------------------
-- A team match's night must be in the match's season.
insert into match_nights (id, season_id, played_on) values
  ('44444444-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000002', '2027-04-01');
select throws_like(
  $$ insert into team_matches (night_id, season_id, team_a_id, team_b_id) values
     ('44444444-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001',
      '22222222-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002') $$,
  '%"team_matches_night_season_fk"%',
  'a team match cannot be on a night from a different season'
);

insert into team_matches (id, night_id, season_id, team_a_id, team_b_id) values
  ('55555555-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002');
insert into teams (id, season_id, name) values
  ('22222222-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 'T4 (S1)'),
  ('22222222-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001', 'T5 (S1)');
insert into team_matches (id, night_id, season_id, team_a_id, team_b_id) values
  ('55555555-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000005');
insert into team_match_pits (night_id, team_match_id, pit) values
  ('44444444-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', 1),
  ('44444444-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', 2);

select throws_like(
  $$ insert into team_match_pits (night_id, team_match_id, pit) values
     ('44444444-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000002', 2) $$,
  '%"team_match_pits_night_id_pit_key"%',
  'a pit cannot be given to two team matches on the same night'
);
select throws_like(
  $$ insert into team_match_pits (night_id, team_match_id, pit) values
     ('44444444-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000002', 3) $$,
  '%"team_match_pits_match_night_fk"%',
  'a pit assignment is on its team match''s night'
);

-- ---------- Pairings -------------------------------------------------------
insert into pairings (id, team_match_id, team_id, slot) values
  ('66666666-0000-0000-0000-0000000000a1', '55555555-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 1),
  ('66666666-0000-0000-0000-0000000000a2', '55555555-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 2),
  ('66666666-0000-0000-0000-0000000000b1', '55555555-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 1);
select throws_like(
  $$ insert into pairings (team_match_id, team_id, slot) values
     ('55555555-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 1) $$,
  '%"pairings_team_match_id_team_id_slot_key"%',
  'a team has one pairing per slot in a team match'
);
select throws_like(
  $$ insert into pairings (team_match_id, team_id, slot) values
     ('55555555-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 4) $$,
  '%"pairings_slot_check"%',
  'pairing slots are 1 to 3'
);
select throws_like(
  $$ insert into pairings (team_match_id, team_id, slot) values
     ('55555555-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000004', 1) $$,
  '%is not in team match%',
  'a pairing''s team must be one of its team match''s teams'
);

-- ---------- Games in a team match ------------------------------------------
create function pg_temp.game(
  p_night text, p_match text, p_team_a text, p_team_b text,
  p_pairing_a text default null, p_pairing_b text default null, p_pit int default null,
  p_status text default 'in_progress'
) returns void language sql as $$
  insert into public.games (client_game_id, night_id, team_match_id, team_a_id, team_b_id,
                            pairing_a_id, pairing_b_id, pit, status, rules)
  values (gen_random_uuid(), p_night::uuid, p_match::uuid, p_team_a::uuid, p_team_b::uuid,
          p_pairing_a::uuid, p_pairing_b::uuid, p_pit, p_status::public.entity_status, '{}');
$$;

select lives_ok(
  $$ select pg_temp.game('44444444-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001',
       '22222222-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002',
       '66666666-0000-0000-0000-0000000000a1', '66666666-0000-0000-0000-0000000000b1', 1) $$,
  'a game in a team match with its pairings and an assigned pit is accepted'
);
select throws_like(
  $$ select pg_temp.game(null, '55555555-0000-0000-0000-000000000001',
       '22222222-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002') $$,
  '%"games_team_match_has_night"%',
  'a team-match game must record its night'
);
select throws_like(
  $$ select pg_temp.game('44444444-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001',
       '22222222-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001') $$,
  '%"games_team_match_fk"%',
  'a game''s side A and B are its team match''s team A and B'
);
select throws_like(
  $$ select pg_temp.game('44444444-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001',
       '22222222-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000005') $$,
  '%"games_team_match_fk"%',
  'a game''s teams must be the teams in its team match'
);
select throws_like(
  $$ select pg_temp.game('44444444-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000001',
       '22222222-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002') $$,
  '%"games_team_match_fk"%',
  'a game''s night must be its team match''s night'
);
select throws_like(
  $$ select pg_temp.game('44444444-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001',
       '22222222-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002',
       '66666666-0000-0000-0000-0000000000b1', '66666666-0000-0000-0000-0000000000a1') $$,
  '%"games_pairing_a_fk"%',
  'side A''s pairing must be team A''s pairing'
);
select throws_like(
  $$ select pg_temp.game('44444444-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001',
       '22222222-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', null, null, 3) $$,
  '%"games_pit_fk"%',
  'a game''s pit must be one assigned to its team match'
);
select throws_like(
  $$ insert into games (client_game_id, team_a_id, team_b_id, pit, rules) values
     (gen_random_uuid(), '22222222-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 1, '{}') $$,
  '%"games_pit_needs_team_match"%',
  'a game outside a team match has no pit'
);
select throws_like(
  $$ select pg_temp.game('44444444-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001',
       '22222222-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002',
       '66666666-0000-0000-0000-0000000000a1', '66666666-0000-0000-0000-0000000000b1', 2) $$,
  '%"games_one_per_grid_cell"%',
  'each grid cell (pairing vs pairing) is played once'
);
update games set status = 'voided' where pairing_a_id = '66666666-0000-0000-0000-0000000000a1';
select lives_ok(
  $$ select pg_temp.game('44444444-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001',
       '22222222-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002',
       '66666666-0000-0000-0000-0000000000a1', '66666666-0000-0000-0000-0000000000b1', 2) $$,
  'a voided game frees its grid cell for a replay'
);
select lives_ok(
  $$ update games set pairing_a_id = '66666666-0000-0000-0000-0000000000a2'
     where pairing_a_id = '66666666-0000-0000-0000-0000000000a1' and status = 'voided' $$,
  'a mislabeled game can be pointed at another pairing of the same team'
);

select * from finish();
rollback;
