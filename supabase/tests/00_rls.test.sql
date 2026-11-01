-- RLS: every public table has RLS on, no policies exist yet, and the API
-- roles (anon, authenticated) can neither read nor write any table.
-- Uses pg_tables, so tables added by later migrations are covered
-- automatically. Relies on supabase/seed.sql having put rows in every table,
-- so "anon sees 0 rows" means RLS hid them rather than the table being empty.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select ok(
  (select count(*) from pg_tables where schemaname = 'public') >= 12,
  'public schema has the expected tables (sanity check)'
);

select is_empty(
  $$ select tablename from pg_tables where schemaname = 'public' and not rowsecurity $$,
  'every public table has RLS enabled'
);

select is_empty(
  $$ select tablename || '.' || policyname from pg_policies where schemaname = 'public' $$,
  'no RLS policies exist yet (deny-all)'
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

set local role authenticated;
select is_empty($$ select * from rls_probe.leaks() $$,
  'authenticated cannot select from or insert into any public table');
reset role;

select * from finish();
rollback;
