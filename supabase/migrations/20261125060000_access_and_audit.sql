-- ============================================================================
-- Access: roles, account <-> player links, RLS policies, game locking, and
-- the audit log. Implements the "Access and roles" section of
-- docs/data-model.md.
--
-- Who can do what:
--   anon                 nothing.
--   signed in, unlinked  nothing, except claim_player() to pick their player.
--   member               (account linked to a player) reads all league data;
--                        creates guest players; creates pairings; starts and
--                        scores games; edits a game they own until it locks.
--   admin                (row in admins) everything above on every row, plus
--                        seasons, teams, rosters, the schedule, pits, account
--                        links, guest merges, locked games; reads the audit log.
--
-- Owning a game: an app game belongs to its current scorer; a paper game to
-- whoever entered it. A game is LOCKED once its own locked_at passes, or, for
-- an app game, once its night's locks_at passes. Paper games are typed in after
-- the night, so the night lock doesn't apply to them; an admin locks them.
--
-- Helpers live in schema "private", which the API doesn't expose. They are
-- SECURITY DEFINER so policies can look things up without recursing into RLS.
-- ============================================================================

-- ---------- Admins ---------------------------------------------------------
-- Managed with SQL by the project owner (no client can write this table):
--   insert into public.admins (user_id, note) values ('<auth user id>', 'Josh');

create table admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  note        text,
  created_at  timestamptz not null default now()
);
alter table admins enable row level security;

-- ---------- Audit log ------------------------------------------------------
-- Append-only record of who changed what and when. Written only by the
-- audit trigger below; readable only by admins. What gets logged:
--   game data (games, game_participants, frames, game_scorer_handoffs):
--     every UPDATE and DELETE, and any INSERT into an already-locked game;
--   league data (players, seasons, teams, team_memberships, match_nights,
--     team_matches, team_match_pits, pairings, admins): every write.

create table audit_log (
  id               bigint generated always as identity primary key,
  at               timestamptz not null default now(),
  actor_user_id    uuid,          -- auth.uid(); NULL for direct database / service work
  actor_player_id  uuid,          -- the actor's linked player, if any
  db_role          text not null default current_user,
  table_name       text not null,
  action           text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  row_id           uuid,
  game_id          uuid,          -- set for game data, so a game's history is one query
  old_row          jsonb,
  new_row          jsonb
);
create index on audit_log (game_id);
create index on audit_log (table_name, row_id);

create trigger audit_log_append_only
  before update on audit_log
  for each row execute function public.reject_update();

alter table audit_log enable row level security;

-- ---------- Helper functions -----------------------------------------------

create schema private;
grant usage on schema private to authenticated;

-- The player linked to the signed-in account (NULL if none).
create function private.current_player_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select p.id from public.players p
  where p.auth_user_id = (select auth.uid()) and p.merged_into_player_id is null
$$;

create function private.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
$$;

-- A member is a signed-in account linked to a player. Admins count too.
create function private.is_member()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.current_player_id() is not null or private.is_admin()
$$;

create function private.night_is_locked(p_night_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select n.locks_at <= now() from public.match_nights n where n.id = p_night_id), false)
$$;

-- Locked = own locked_at passed, or (app game) its night's locks_at passed.
create function private.game_is_locked(p_game_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(g.locked_at <= now(), false)
      or (g.source = 'app' and private.night_is_locked(g.night_id))
  from public.games g
  where g.id = p_game_id
$$;

-- The signed-in member owns this game and it isn't locked.
create function private.can_score_game(p_game_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select private.current_player_id() is not null
       and case g.source
             when 'app'   then g.current_scorer_player_id = private.current_player_id()
             else              g.entered_by_player_id     = private.current_player_id()
           end
       and not private.game_is_locked(g.id)
    from public.games g
    where g.id = p_game_id
  ), false)
$$;

-- True when the current statement comes straight from an API client
-- (anon / authenticated), not from a trigger, migration, seed, or the
-- service role.
create function private.is_api_client()
returns boolean
language sql stable
set search_path = ''
as $$
  select current_user in ('anon', 'authenticated')
$$;

grant execute on all functions in schema private to authenticated;

-- ---------- Account -> player link: claim once, then admin-only -------------
-- A new account picks its own player once. After that the link is fixed;
-- only an admin can change or clear it (by updating players.auth_user_id).

create function public.claim_player(p_player_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.players where auth_user_id = v_uid) then
    raise exception 'this account is already linked to a player; ask an admin to change it'
      using errcode = 'insufficient_privilege';
  end if;
  update public.players
     set auth_user_id = v_uid
   where id = p_player_id
     and auth_user_id is null
     and not is_guest
     and merged_into_player_id is null;
  if not found then
    raise exception 'that player can''t be claimed (already linked, a guest, merged, or missing)'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

revoke execute on function public.claim_player(uuid) from public, anon;
grant execute on function public.claim_player(uuid) to authenticated;

-- ---------- Games: protected columns and scorer sync -----------------------

-- Non-admin clients can't change a game's identity, schedule placement,
-- ownership, or lock. The scorer changes only through a handoff (trigger
-- below, which runs nested: pg_trigger_depth() > 1).
create function private.games_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_api_client() or private.is_admin() or pg_trigger_depth() > 1 then
    return new;
  end if;
  if new.client_game_id           is distinct from old.client_game_id
  or new.night_id                 is distinct from old.night_id
  or new.team_match_id            is distinct from old.team_match_id
  or new.team_a_id                is distinct from old.team_a_id
  or new.team_b_id                is distinct from old.team_b_id
  or new.pairing_a_id             is distinct from old.pairing_a_id
  or new.pairing_b_id             is distinct from old.pairing_b_id
  or new.source                   is distinct from old.source
  or new.entered_by_player_id     is distinct from old.entered_by_player_id
  or new.current_scorer_player_id is distinct from old.current_scorer_player_id
  or new.locked_at                is distinct from old.locked_at
  then
    raise exception 'only an admin can change a game''s teams, pairings, owner, scorer or lock (use a handoff to change scorer)'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger games_guard
  before update on games
  for each row execute function private.games_guard();

-- Every scorer assignment is logged, including the first: a new game with a
-- scorer gets a handoff from inning 1.
create function private.games_log_first_scorer()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.current_scorer_player_id is not null then
    insert into public.game_scorer_handoffs (game_id, player_id, from_inning, handed_off_at)
    values (new.id, new.current_scorer_player_id, 1, coalesce(new.played_at, now()));
  end if;
  return null;
end;
$$;

create trigger games_log_first_scorer
  after insert on games
  for each row execute function private.games_log_first_scorer();

-- A handoff makes its player the current scorer.
create function private.handoffs_set_current_scorer()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.games
     set current_scorer_player_id = new.player_id
   where id = new.game_id
     and current_scorer_player_id is distinct from new.player_id;
  return null;
end;
$$;

create trigger handoffs_set_current_scorer
  after insert on game_scorer_handoffs
  for each row execute function private.handoffs_set_current_scorer();

-- ---------- Audit trigger --------------------------------------------------
-- TG_ARGV[0] = 'game' (game data) or 'league'.

create function private.audit()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row     jsonb := to_jsonb(coalesce(new, old));
  v_game_id uuid;
begin
  if tg_argv[0] = 'game' then
    v_game_id := case when tg_table_name = 'games' then (v_row ->> 'id')::uuid
                      else (v_row ->> 'game_id')::uuid end;
    if tg_op = 'INSERT' and not coalesce(private.game_is_locked(v_game_id), false) then
      return null;   -- normal live scoring isn't logged; edits and deletes are
    end if;
  end if;

  insert into public.audit_log (actor_user_id, actor_player_id, table_name, action, row_id, game_id, old_row, new_row)
  values (
    (select auth.uid()),
    private.current_player_id(),
    tg_table_name,
    tg_op,
    case when v_row ? 'id' and tg_table_name <> 'admins' then (v_row ->> 'id')::uuid
         when tg_table_name = 'admins' then (v_row ->> 'user_id')::uuid end,
    v_game_id,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end;
$$;

create trigger audit after insert or update or delete on games                for each row execute function private.audit('game');
create trigger audit after insert or update or delete on game_participants    for each row execute function private.audit('game');
create trigger audit after insert or update or delete on frames               for each row execute function private.audit('game');
create trigger audit after insert or update or delete on game_scorer_handoffs for each row execute function private.audit('game');

create trigger audit after insert or update or delete on players          for each row execute function private.audit('league');
create trigger audit after insert or update or delete on seasons          for each row execute function private.audit('league');
create trigger audit after insert or update or delete on teams            for each row execute function private.audit('league');
create trigger audit after insert or update or delete on team_memberships for each row execute function private.audit('league');
create trigger audit after insert or update or delete on match_nights     for each row execute function private.audit('league');
create trigger audit after insert or update or delete on team_matches     for each row execute function private.audit('league');
create trigger audit after insert or update or delete on team_match_pits  for each row execute function private.audit('league');
create trigger audit after insert or update or delete on pairings         for each row execute function private.audit('league');
create trigger audit after insert or update or delete on admins           for each row execute function private.audit('league');

-- ---------- RLS policies ---------------------------------------------------
-- All policies are TO authenticated; anon has none, so anon sees nothing.
-- Helper calls are wrapped in (select ...) so Postgres evaluates them once
-- per statement, not once per row.

-- Members read all league data.
do $$
declare t text;
begin
  foreach t in array array[
    'players', 'seasons', 'teams', 'team_memberships', 'match_nights', 'team_matches',
    'team_match_pits', 'pairings', 'games', 'game_participants', 'frames', 'game_scorer_handoffs'
  ] loop
    execute format(
      'create policy members_read on public.%I for select to authenticated using ((select private.is_member()))', t);
  end loop;
end $$;

-- Admins read the admin list and the audit log.
create policy admins_read on admins    for select to authenticated using ((select private.is_admin()));
create policy admins_read on audit_log for select to authenticated using ((select private.is_admin()));

-- Admins write league and game data (not admins, audit_log, or handoff edits).
do $$
declare t text;
begin
  foreach t in array array[
    'players', 'seasons', 'teams', 'team_memberships', 'match_nights', 'team_matches',
    'team_match_pits', 'pairings', 'games', 'game_participants', 'frames'
  ] loop
    execute format(
      'create policy admins_insert on public.%I for insert to authenticated with check ((select private.is_admin()))', t);
    execute format(
      'create policy admins_update on public.%I for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))', t);
    execute format(
      'create policy admins_delete on public.%I for delete to authenticated using ((select private.is_admin()))', t);
  end loop;
end $$;

-- Players: members add ad-hoc guests (name only, no account, not merged).
create policy members_add_guest on players for insert to authenticated
  with check (
    (select private.is_member())
    and is_guest and auth_user_id is null and merged_into_player_id is null
  );

-- Pairings: a member creates one when a pair plays its first game. Fixing a
-- mislabel (update/delete) is admin-only.
create policy members_add_pairing on pairings for insert to authenticated
  with check ((select private.is_member()));

-- Games: a member starts a game they own. App game: they are the scorer and
-- the enterer. Paper game: they are the enterer (the scorer is whoever kept
-- the sheet). No lock may be set, and an app game can't be started on a
-- night that's already locked.
create policy members_start_game on games for insert to authenticated
  with check (
    entered_by_player_id = (select private.current_player_id())
    and locked_at is null
    and case source
          when 'app' then current_scorer_player_id = (select private.current_player_id())
                          and not private.night_is_locked(night_id)
          else true
        end
  );

-- A member edits a game they own until it locks. USING checks the row as it
-- was; WITH CHECK checks the row as it will be (games_guard already stops
-- changes to owner, scorer and lock columns).
create policy members_edit_own_game on games for update to authenticated
  using (private.can_score_game(id))
  with check (
    locked_at is null
    and case source
          when 'app' then current_scorer_player_id = (select private.current_player_id())
                          and not private.night_is_locked(night_id)
          else entered_by_player_id = (select private.current_player_id())
        end
  );
-- No member DELETE on games: a scorer voids a game (status = 'voided').

-- Participants and frames: the game's owner, until it locks.
create policy members_insert_own on game_participants for insert to authenticated
  with check (private.can_score_game(game_id));
create policy members_update_own on game_participants for update to authenticated
  using (private.can_score_game(game_id)) with check (private.can_score_game(game_id));
create policy members_delete_own on game_participants for delete to authenticated
  using (private.can_score_game(game_id));

create policy members_insert_own on frames for insert to authenticated
  with check (private.can_score_game(game_id));
create policy members_update_own on frames for update to authenticated
  using (private.can_score_game(game_id)) with check (private.can_score_game(game_id));
create policy members_delete_own on frames for delete to authenticated
  using (private.can_score_game(game_id));

-- Handoffs: the current owner hands the game to someone else (or an admin
-- reassigns it). Append-only: no UPDATE or DELETE policy for anyone.
create policy owner_or_admin_hands_off on game_scorer_handoffs for insert to authenticated
  with check (private.can_score_game(game_id) or (select private.is_admin()));
