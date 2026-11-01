-- Players, teams, memberships, team matches, pairings: season and identity rules.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

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

-- Pairing members: one per end.
insert into team_matches (id, night_id, season_id, team_a_id, team_b_id) values
  ('55555555-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002');
insert into pairings (id, team_match_id, team_id, slot) values
  ('66666666-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 1);
insert into pairing_members (pairing_id, player_id, court_end) values
  ('66666666-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', 'south');
select throws_like(
  $$ insert into pairing_members (pairing_id, player_id, court_end) values
     ('66666666-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000002', 'south') $$,
  '%"pairing_members_pairing_id_court_end_key"%',
  'a pairing has at most one member per end'
);

select * from finish();
rollback;
