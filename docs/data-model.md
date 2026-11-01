# Horseshoe League Scorekeeping — Data Model

Working draft. Lives in the repo at `docs/data-model.md` and is referenced from
`CLAUDE.md` so every Claude Code session has the domain model in context.

Target stack: a PWA (Vite + TypeScript, `vite-plugin-pwa`) backed by Supabase
(Postgres + auto-generated API + auth). The SQL schema lives in
`supabase/migrations/`; see `docs/database.md` for how schema changes are made.
This document is the *domain* spec — rules and meaning — and the migrations are
the *implementation* of it. When they disagree, stop and reconcile.

---

## Domain summary

- A **league** runs **seasons**.
- A season has **teams** of 8 players.
- On a **match night**, all teams play at the same venue.
- A **team match** pairs two teams and contains exactly **9 games**.
- Each team fields **3 pairings** (6 of its 8 players). Pairings are decided by the
  captain at the start of the night and are **locked for that night**.
- Each pairing plays each opposing pairing once → 3 × 3 = 9 games.
- **2 games run concurrently**; the pairing sitting out supplies the scorekeeper.
- The court has a **north** and a **south** end. Each end holds **2 opponents** —
  one player from each team. (Partners are split across the two ends.) At the start
  of the night, each team assigns one of its two players to north and one to south.
- An **inning** is two throwing turns: the **south** pair throws and is scored,
  then the **north** pair throws and is scored. **South always throws first.** So
  all four players throw two shoes each per inning, and there are **two scoring
  events per inning** — one per end.
- The atomic scoring unit is therefore a **frame** (one end's throw, one score),
  not the inning. Two frames per inning, **15 innings = 30 frames** in a full game
  (30 shoes per player ÷ 2 per frame).
- Substitutes are common and come from three sources: a **rover** borrowed from
  another team, a **sub pool**, or an **ad-hoc guest** with no league history.
- The league currently scores on **paper**, and some members will continue to.
  Paper sheets are entered into the app after the fact, at varying levels of detail.
- **Scorekeepers change mid-night**, and sometimes mid-game, as people rotate in
  to play.
- **Players sometimes leave early**, and someone else finishes their games. A
  pairing's composition is therefore not guaranteed stable across all 3 of its games.

---

## Core principles

1. **Frames are the source of truth.** Each frame (one end's throw) records who
   threw, which team scored and by how much, and each thrower's ringers. Two frames
   make an inning. Running totals, ringer percentages, and standings are *derived* —
   never entered, never stored as the primary record. The user never types a total.
2. **The app records verdicts, not shoes.** The players judge each frame at the
   pit and declare the outcome (which team scored, how many, any ringers); the
   scorekeeper records that declaration. There is **no in-app cancellation math**
   and no shoe-by-shoe log — cancellation already happened at the pit. Corrections
   edit the frame in place.
3. **A player is never owned by a team.** Team membership is a separate,
   season-scoped record. This is what makes substitutes tractable.
4. **One writer at a time, but ownership transfers.** A game has exactly one
   active scorekeeper, so there is still no concurrent-edit resolution — but
   that scorekeeper can change mid-game, and the transfer must be explicit and
   auditable.
5. **Snapshot onto the game, don't reference.** Both the *rules* and the *actual
   participants* are copied onto each game. If a rule changes mid-season or a
   player leaves early and is replaced, past games must still be correct without
   rewriting them.
6. **Fidelity varies by game.** App-scored games have full inning-by-inning detail
   with ringers; paper-entered games may have that too, or only a final score.
   Every derived statistic must declare what data it requires and exclude games
   that can't supply it (ringer % needs inning detail; win/loss needs only a final).

---

## Entities

What each entity means and which facts it must hold. Field names here are
conceptual (camelCase); the actual tables and columns (snake_case) are defined in
`supabase/migrations/`. If a column and the meaning described here disagree, stop
and reconcile.

### Players
Global. Not scoped to a team or a season.

| Field | Type | Notes |
|---|---|---|
| `displayName` | string | |
| `authUid` | string? | Null for guests who never sign in |
| `isGuest` | bool | True for ad-hoc fill-ins created on the spot |
| `mergedIntoPlayerId` | string? | Set when a guest record is merged into a real one |
| `createdAt` | timestamp | |

A guest can be created with nothing but a name, mid-game, with no connectivity.
Design the merge path now even if you build the merge UI later.

### Teams

| Field | Type | Notes |
|---|---|---|
| `seasonId` | ref | |
| `name` | string | |
| `captainPlayerId` | ref | |

### Team memberships
The 8-person roster lives here, not on the player or the team.

| Field | Type | Notes |
|---|---|---|
| `seasonId` | ref | |
| `teamId` | ref | |
| `playerId` | ref | |
| `active` | bool | Allows mid-season roster changes without losing history |

### Match nights

| Field | Type | Notes |
|---|---|---|
| `seasonId` | ref | |
| `date` | date | |
| `venue` | string | |
| `status` | enum | `scheduled` / `inProgress` / `complete` |

### Team matches

| Field | Type | Notes |
|---|---|---|
| `nightId` | ref | |
| `seasonId` | ref | Denormalized for querying |
| `teamAId`, `teamBId` | ref | |
| `status` | enum | |

### Pairings
Night-scoped. This is a first-class entity, not a join table.

| Field | Type | Notes |
|---|---|---|
| `teamMatchId` | ref | |
| `teamId` | ref | |
| `slot` | int | 1, 2, or 3 |
| `members` | array[2] | See below |

Each member:

| Field | Type | Notes |
|---|---|---|
| `playerId` | ref | |
| `capacity` | enum | `roster` / `rover` / `subPool` / `guest` |
| `homeTeamId` | ref? | For rovers: the team they normally play for |

`capacity` is the field that lets you answer the sub-attribution question later,
whatever the league decides. Omitting it means backfilling every historical game.

**Important:** `members` records the captain's *intent* at the start of the night.
It is not the record of who actually played a given game — a player may leave
early and be replaced partway through. Who actually played is snapshotted onto
each game (see below). Never compute a stat by joining a game to its pairing's
member list.

### Games

| Field | Type | Notes |
|---|---|---|
| `clientGameId` | uuid | Generated on device. Makes offline creation idempotent |
| `teamMatchId` | ref | |
| `round` | int | |
| `court` | int | |
| `pairingAId`, `pairingBId` | ref | Links to intent; not the record of who played |
| `participantsA`, `participantsB` | snapshot rows | **Snapshot** of who actually played this game — each: playerId + capacity + `end` (`north`/`south`) |
| `source` | enum | `app` / `paper` — how the game was recorded |
| `detailLevel` | enum | `inning` (full inning-by-inning) / `finalOnly` |
| `currentScorerPlayerId` | ref? | Who holds the game now. Mutable |
| `scorerHistory` | log | Append-only: `{playerId, fromInning, at}` per handoff |
| `enteredByPlayerId` | ref? | For paper entry: who typed it in, distinct from who scored it |
| `playedAt` | timestamp | When the game happened, not when it was entered |
| `status` | enum | `scheduled` / `inProgress` / `complete` / `voided` |
| `rules` | object (JSON) | Snapshot: end condition (see Scoring rules). No scoring engine needed |
| `frames` | child rows | The record — one row per end's throw. None for `finalOnly`. See below |
| `finalScoreA`, `finalScoreB` | int? | Derived (sum of frame points) for app games; entered directly for `finalOnly` paper games |
| `completedAt` | timestamp? | |

Frames are stored as their own rows keyed to the game (one per end per inning, ~30
in a full game), not embedded in the game record.

### Frames

A **frame** is one end's throw and one score — the atomic unit. A full inning is two
frames: south (thrown and scored first), then north. Play order is inning, then
south before north.

| Field | Type | Notes |
|---|---|---|
| `inning` | int | 1–15. Two frames share an inning number |
| `end` | enum | `south` / `north`. South is always the first frame of an inning |
| `throwerAId` | ref | Team A's player at this end (defaults from the side assignment; stored so an early-leaver swap doesn't rewrite history) |
| `throwerBId` | ref | Team B's player at this end |
| `scoringTeam` | enum? | `A` / `B` / `null`. Null = nobody scored (the dash/zero frame) |
| `points` | int | 0–6 to the scoring team (max 6 = a double ringer); `0` when `scoringTeam` is null |
| `ringers` | map | Per throwing player → total ringers thrown (0–2). Live/dead is derived, not stored |

Notes:
- **Only one team scores per frame.** `scoringTeam` + `points` is the whole verdict;
  the other side is implicitly zero. No per-shoe result, no scoring math in the app.
- The two throwers in a frame are **opponents** — Team A's and Team B's player at
  that end. They're fixed across the game unless someone leaves early, which is why
  they're stored per frame rather than only on the game.
- **Store total ringers per player; derive live/dead.** Each of the two throwers has
  a count of ringers thrown (0–2) — that's the only ringer input. Dead ringers =
  min(the two throwers' counts); live = the remainder. This holds under one-for-one
  cancellation with no leaners. Storing the raw counts (not a live/dead split) keeps
  the record from drifting; compute live/dead, and ringer % (total ringers ÷ shoes
  thrown), on read.
- **The score does not fully determine ringers.** A dead ringer and the non-scoring
  side's ringers contribute nothing to `points`, so ringers can't be back-derived
  from the score — they stay an explicit input. The score is used only to pre-suggest
  a value and to flag impossible score+ringer combinations.
- **Running total is derived.** A team's score after any point is the sum of
  `points` where `scoringTeam` matches, across frames in play order. Never entered.
- **Display grouping:** the UI thinks in innings (shows "Inning 6", south-then-north)
  even though the store is a flat frame list. Group by `inning` for the review table.

### Standings (derived)
Never stored as the primary record — recomputable from games at any time.
Implement as SQL views over the tables, or compute client-side; at league scale
either works. Deferred until the league settles the open questions below.

---

## Offline behaviour

The PWA has no built-in sync layer, so offline is handled explicitly.

- The scorekeeper's device creates the game locally with a client-generated UUID
  (`clientGameId`).
- The in-progress game (setup + frames) is saved to IndexedDB after every change,
  so a refresh, crash, or closed tab loses nothing.
- Once the backend is wired up (planned, not built): each change is queued in a
  local outbox and written to Supabase when the network allows. Writes are upserts
  keyed on `clientGameId` (and game + inning + end for frames), so a retry that
  fires twice can't create duplicates.
- The IndexedDB copy is a working draft, not the record. Browsers — Safari
  especially — can evict it. Once synced, the server is the record.
- Because there is exactly one writer per game, no conflict resolution is needed.
- Lineups and pairings must be enterable offline too — captains set them at the
  start of the night, which is exactly when the venue is most congested.

---

## Paper entry

Paper coexisting with the app is a permanent condition, not a migration phase.

- Paper games are entered after the night, typically nine at a time. This needs a
  **dedicated bulk-entry screen**, not the live scoring UI. Optimise for keyboard
  speed and tab order, not for tapping shoes.
- `detailLevel` records what the sheet actually contained. A `finalOnly` game
  contributes to win/loss and standings but cannot contribute to ringer percentage.
- Every stat query must filter on `detailLevel`, and every stat displayed to a
  user should indicate coverage (e.g. "based on 14 of 27 games"). Silently mixing
  fidelity levels produces numbers that look authoritative and are wrong.
- Paper entry happens away from the venue, so it is the one flow that can safely
  assume connectivity.
- Consider letting a captain photograph the paper sheet and attach it to the team
  match, so the source is recoverable when a number is disputed.

## Scorekeeper handoff

A game can change hands mid-play. The model stays single-writer — only one device
is active at a time — but the transfer needs care.

- Handoff writes a new entry to `scorerHistory` and updates `currentScorerPlayerId`.
  The `fromInning` field records which inning the new scorer started at.
- **The hazard is offline handoff.** If the outgoing device has unsynced innings and
  the incoming device pulls the game from the server, the incoming scorer starts
  from a stale record and the two diverge — the one case that reintroduces conflict.
- v1 rule: **handoff requires the outgoing device to flush first.** If it can't
  reach the network, the app blocks the transfer and tells the user to hand the
  physical phone over instead. This is an acceptable answer and a two-line check.
- v2, if it proves annoying: transfer the game locally via QR code or nearby
  share, carrying the inning record with it. Don't build this first.
- Handoff and player substitution are **different events**. One changes who is
  recording; the other changes who is playing. Model them separately, or you will
  eventually credit a ringer to the scorekeeper.

## Scoring rules

**The app does not compute scores.** Players evaluate each inning at the pit and
declare the result; the app records it. The values below are reference for humans,
not a spec for an engine — there is no cancellation function to write or test.

### Shoe values (for reference only)

| Result | Value |
|---|---|
| Ringer | 3 |
| Close shoe | 1 |
| Miss | 0 |

Cancellation ("dead ringers"): matching ringers cancel one-for-one, and only one
side scores per inning. All of this happens at the pit — the app just stores which
team scored and how many. This is why the earlier shoe-by-shoe design was wrong:
a point can be cancelled by a later shoe, so no per-shoe tally is meaningful.

### Zero-point innings: dash vs "0"

When neither side scores, the paper shows a dash (some players) or a `0` (others).
This is a **display preference, not data** — store the frame as `scoringTeam:
null, points: 0` and let a setting control whether the UI renders `—` or `0`.
Default to `—`; make it a one-tap toggle.

### Ringer entry validation (by score)

The scorekeeper enters the score first; it constrains the ringer options. The whole
system reduces to one identity:

```
points = 3 × liveRingers + closeShoePoints
liveRingers(scorer) = rs − min(rs, ro)
```

where `rs` = scorer's ringers, `ro` = opponent's ringers, each 0–2. Two shoes per
player cap everything. Allowed combinations per score:

| Score | Scorer ringers | Opponent ringers | Dead (each) | Reason |
|---|---|---|---|---|
| 1 | 0 or 1 | must equal scorer | 0 or 1 | no live ringer; nothing, or one each (both dead) + a close |
| 2 | 0 | 0 | 0 | two close shoes; any ringer scores ≥3 |
| 3 | 1 or 2 | 0 if scorer=1, 1 if scorer=2 | 0 or 1 | exactly one live ringer, no close |
| 4 | exactly 1 | 0 | 0 | one live ringer + one close |
| 5 | — | — | — | **impossible** with two shoes — the "5" button should not be selectable |
| 6 | exactly 2 | 0 | 0 | two live ringers |

Defaults: 1 → (0,0); 3 → (1,0); 4 → (1,0); 6 → (2,0).

Couplings the UI must enforce (tighter than a simple max):
- **3:** allowed pairs are exactly (scorer 1, opp 0) or (scorer 2, opp 1). Disallow
  (1,1) — that has no live ringer and is a 1-point turn.
- **4:** scorer forced to 1 (disable scorer's 0 and 2); opponent forced to 0.
- **6:** scorer forced to 2 (disable scorer's 0 and 1); opponent forced to 0.
- **5:** never valid; drop the button or keep it permanently disabled.

**Implementation:** encode this table as data (score → allowed configs, defaults,
disabled options) and drive both the UI enable/disable and validation from one pure
function — not a stack of hand-written conditionals. One source of truth; a rule
change is a table edit.

A game is won by:

1. **First to 21 or over** — the moment a team's derived total reaches 21+, that
   team wins. Since only one team scores per frame, this is just: after recording
   a frame, if the scoring team's total ≥ 21, the game is complete.
2. **Otherwise, highest score at 30 shoes** — if neither team has reached 21 by the
   30-shoe limit, the higher score wins.
3. **Tie at 30 shoes → not yet decided by the league.** The current default is
   sudden death (play continues inning by inning until a team scores a point;
   first to score wins), set by `tieAtLimit` in the rules snapshot so a different
   answer is a setting change, not a rewrite. See Open questions.

The app derives the running total and applies rule 1 automatically. Rules 2–3 fire
at the 15-inning mark (30 shoes per player). In practice most games end on rule 1
before the limit matters, but the app still applies the backstop.

```
endCondition: {
  targetPoints: 21,          // first to reach 21+ wins outright
  shoeLimit: 30,             // per player; backstop, highest score wins at the limit
  shoeLimitInnings: 15,      // 30 shoes/player ÷ 2 shoes/inning = 15 innings
  tieAtLimit: 'suddenDeath'  // DEFAULT pending league decision — see Open questions
}
```

"30 shoes" is **per player**: every inning, each player throws 2 shoes, so the cap
is reached after **15 innings**. That's the maximum length of the inning array in a
game that goes the distance (plus any sudden-death innings on a tie).

## Design tokens (theme colors)

Define these as **CSS custom properties** on `:root` in one tokens file, so the
palette lives in one place and every component references the variable, never a
raw hex.

| Token | Hex | Used for |
|---|---|---|
| `--team-a` | `#053961` | Deep navy — first team's score panel, selected-team button, player labels, row accent |
| `--team-b` | `#7C3C0F` | Rust/maroon — second team's equivalents |
| `--action` | `#0867C4` | Selected points button, active ringer selection, main action buttons |
| `--action-alt` | `~#2E7AC8` | Confirm/Next button (a slightly lighter action blue; the button is a mild gradient) |

State colors already used in the prototype, to formalize as tokens:
`--editing` (amber banner when editing a past turn), `--final-inning` (warm
orange→red gradient band), `--extra-innings` (stronger red gradient band). These
three must stay visually distinct from each other.

White text sits on the `teamA`/`teamB` panels for contrast; neutral greys carry
disabled and unselected states so the team colors and the action blue stand out.
Sampled from the earlier prototype; the two panels have a mild edge-to-edge gradient.

Likely additions as more screens arrive (lineup, standings): a `background`, a
`win`/positive color for the game-over state, and a `warning` color for the
impossible score+ringer flags. Add them to the same named palette rather than
introducing one-off hexes.

## Open questions for the league

These are rules decisions, not engineering decisions. None block starting the
build, because the app records whatever the players declare regardless — but all
are needed before stats and standings can be considered correct.

**Answered:** cancellation with dead ringers (done at the pit, not in the app);
no leaners; throwers each inning are opponents at one pit; ringers stored as one
total count per thrower (0–2) with live/dead derived; running total derived, never
entered. **Win rule confirmed:** first to 21+, else highest at 30 shoes per player
(15 innings). What happens on a tie at the limit is still open (below).

Note the cancellation edge cases (two-ringer innings, ringer-plus-close, etc.) are
**no longer app questions** — the players resolve them and the app just stores the
result. They're dropped.

**Still open — game rules:**

- Tie at the 30-shoe limit. Testers gave three different answers: (a) allow ties;
  (b) no ties — sudden death, first to score wins; (c) no ties — complete the
  inning, then compare. The app defaults to (b) via `tieAtLimit` until the league
  decides.

**Still open — league administration:**

1. Sub attribution: when a rover, pool sub, or guest plays, whose record does the
   game count toward — the team they played for, their own, both, or neither?
2. Does a rover's appearance affect their own team's standings in any way?
3. How are team standings computed — games won, total points scored, or both?
4. Standings tiebreakers?
5. Is there a minimum-games threshold before a player appears in stat leaderboards?
6. When a player leaves early and is replaced mid-game, who gets credit for that
   game — the player who started, the one who finished, both partially, or neither?
7. Is a paper-entered game equal to an app-scored one for standings purposes, or
   does the league want a minimum level of detail?
8. Who is authorised to enter paper scores after the fact, and can an entered
   score be corrected later — by whom, and up to when?
