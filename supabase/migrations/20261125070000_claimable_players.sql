-- ============================================================================
-- The "Which player are you?" list for a new account.
--
-- Members read players through RLS, but a signed-in account that hasn't
-- claimed a player yet isn't a member, so it can't see the roster it has to
-- pick from. This function gives exactly that account exactly that list:
-- players it could claim with claim_player(), with their current team for
-- telling same-named people apart. Nothing else about the league is exposed.
--
-- Returns no rows for anon (no execute grant) and for an account that is
-- already linked (it has nothing left to claim).
-- ============================================================================

create function public.claimable_players()
returns table (id uuid, display_name text, team_name text)
language sql stable security definer
set search_path = ''
as $$
  select p.id,
         p.display_name,
         -- The team from the player's most recent season, if any.
         (select t.name
            from public.team_memberships m
            join public.teams t   on t.id = m.team_id
            join public.seasons s on s.id = m.season_id
           where m.player_id = p.id and m.active
           order by s.starts_on desc nulls last, s.created_at desc
           limit 1) as team_name
    from public.players p
   where (select auth.uid()) is not null
     and not exists (select 1 from public.players me where me.auth_user_id = (select auth.uid()))
     and p.auth_user_id is null
     and not p.is_guest
     and p.merged_into_player_id is null
   order by p.display_name, p.id
$$;

revoke execute on function public.claimable_players() from public, anon;
grant execute on function public.claimable_players() to authenticated;
