-- RLS baseline: every public table has RLS on, and anyone who isn't a member
-- (anon, or a signed-in account not linked to a player) can neither read nor
-- write any table. Member and admin rules are in 03_access.test.sql.
-- Uses pg_tables, so tables added by later migrations are covered
-- automatically. Relies on supabase/seed.sql having put rows in every table,
-- so "sees 0 rows" means RLS hid them rather than the table being empty.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select ok(
  (select count(*) from pg_tables where schemaname = 'public') >= 14,
  'public schema has the expected tables (sanity check)'
);

select is_empty(
  $$ select tablename from pg_tables where schemaname = 'public' and not rowsecurity $$,
  'every public table has RLS enabled'
);

select is_empty(
  $$ select tablename || '.' || policyname from pg_policies
     where schemaname = 'public' and 'anon' = any (roles) $$,
  'no policy applies to anon'
);

select is_empty(
  $$ select policyname from pg_policies
     where schemaname = 'public' and tablename in ('admins', 'audit_log') and cmd <> 'SELECT' $$,
  'no client can write admins or audit_log'
);

select is_empty(
  $$ select policyname from pg_policies
     where schemaname = 'public' and tablename = 'game_scorer_handoffs' and cmd in ('UPDATE', 'DELETE', 'ALL') $$,
  'no policy grants UPDATE or DELETE on scorer handoffs (append-only)'
);

-- Precondition for the "sees 0 rows" checks below.
create function pg_temp.empty_tables() returns setof text language plpgsql as $$
declare t record; n bigint;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('select count(*) from public.%I', t.tablename) into n;
    if n = 0 then return next t.tablename; end if;
  end loop;
end $$;

select is_empty(
  $$ select * from pg_temp.empty_tables() $$,
  'precondition: seed has rows in every public table'
);

-- Tries SELECT and INSERT on every public table as the CURRENT role. Returns
-- one line per leak. A permission error and an RLS rejection are both
-- SQLSTATE 42501 (insufficient_privilege); either one counts as blocked.
create schema rls_probe;
create function rls_probe.leaks() returns setof text language plpgsql as $$
declare t record; n bigint;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    begin
      execute format('select count(*) from public.%I', t.tablename) into n;
      if n > 0 then return next t.tablename || ': SELECT returned ' || n || ' rows'; end if;
    exception when insufficient_privilege then null;
    end;
    begin
      execute format('insert into public.%I default values', t.tablename);
      return next t.tablename || ': INSERT succeeded';
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;
grant usage on schema rls_probe to anon, authenticated;
grant execute on function rls_probe.leaks() to anon, authenticated;

set local role anon;
select is_empty($$ select * from rls_probe.leaks() $$,
  'anon cannot select from or insert into any public table');
select is(
  (select count(*)::int from public.game_scores), 0,
  'anon sees no rows through the game_scores view (security_invoker)'
);
reset role;

-- Signed in, but no player linked yet (seed: new@ringer.test).
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0009-000000000004", "role": "authenticated"}', true);
set local role authenticated;
select is_empty($$ select * from rls_probe.leaks() $$,
  'a signed-in account with no linked player cannot select from or insert into any public table');
select is(
  (select count(*)::int from public.game_scores), 0,
  'an unlinked account sees no rows through game_scores');
reset role;

-- A token with no user at all.
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
set local role authenticated;
select is_empty($$ select * from rls_probe.leaks() $$,
  'authenticated with no user id cannot select from or insert into any public table');
reset role;

select * from finish();
rollback;
