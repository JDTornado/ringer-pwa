# Pilot notes: FlutterFlow → Claude Code PWA

Observations that matter for deciding whether the office moves its mobile apps.
One dated line per item. Tag each one: [agent], [ios], [deploy], [tooling], [spec].

- 2026-11-01 [spec] Docs written for one backend carry leftovers after a stack change: data-model.md still describes Firestore collections, offline persistence, and Cloud Functions after the move to Postgres. The agent treats docs as instructions, so stale storage advice is a real hazard. Budget a doc-cleanup pass when changing stacks. (Fixed the same day: entities made storage-neutral, offline rewritten for IndexedDB + outbox, tie rule moved to open, schema checks added to database.md.)
- 2026-11-01 [tooling] The dev machine had no Node.js (and no Python), so the first npm step failed before anything ran. It was installed mid-task via `winget install OpenJS.NodeJS.LTS` (v26.13.0), and agent shells needed PATH patched by hand until restarted. Add "Node LTS + Docker Desktop installed" to the machine-setup checklist for any office repo.
- 2026-11-01 [spec] Postgres gotcha caught by a pgTAP test: in `select court_end::text ... order by inning, court_end`, the ORDER BY binds to the text-cast output column and sorts north before south. Play-order queries must sort on the enum column itself (qualify it, or don't alias over it).
