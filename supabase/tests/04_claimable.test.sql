-- claimable_players(): the roster a new, unlinked account picks from.
-- Seed accounts (supabase/seed.sql):
--   tom@ringer.test   ...0009-...02  member, linked to Tom (a4)
--   new@ringer.test   ...0009-...04  signed in, no player yet
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create schema t;
create function t.login(uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
grant usage on schema t to anon, authenticated;
grant execute on function t.login(text) to anon, authenticated;

-- ---------- A new account ---------------------------------------------------
select t.login('00000000-0000-0000-0009-000000000004');
set local role authenticated;

select is((select count(*)::int from players), 0,
  'an unlinked account still cannot read the players table');
select ok((select count(*) from claimable_players()) > 0,
  'an unlinked account sees claimable players');
select is(
  (select team_name from claimable_players() where id = '00000000-0000-0000-0001-0000000000a6'),
  'Silver State Shoes', 'each claimable player comes with their team');
select ok(not exists (select 1 from claimable_players() where id = '00000000-0000-0000-0001-0000000000a4'),
  'a player linked to another account is not listed');
select ok(not exists (select 1 from claimable_players() where id = '00000000-0000-0000-0001-0000000000d1'),
  'a guest is not listed');
select ok(
  (select count(*) from claimable_players() c where c.id = '00000000-0000-0000-0001-0000000000c1') = 1,
  'a rover on another team is listed');

-- Every listed player can actually be claimed.
select lives_ok(
  $$ select claim_player((select id from claimable_players() where display_name = 'Hank Bauer')) $$,
  'a listed player can be claimed');
select is((select count(*)::int from claimable_players()), 0,
  'once linked, the account has nothing left to claim');

reset role;

-- ---------- Anon ------------------------------------------------------------
set local role anon;
select throws_ok($$ select * from claimable_players() $$, '42501', null,
  'anon cannot list claimable players');
reset role;

select * from finish();
rollback;
