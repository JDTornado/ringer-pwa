# Pilot notes: FlutterFlow → Claude Code PWA

Observations that matter for deciding whether the office moves its mobile apps.
One dated line per item. Tag each one: [agent], [ios], [deploy], [tooling], [spec].

- 2026-11-01 [spec] Docs written for one backend carry leftovers after a stack change: data-model.md still describes Firestore collections, offline persistence, and Cloud Functions after the move to Postgres. The agent treats docs as instructions, so stale storage advice is a real hazard. Budget a doc-cleanup pass when changing stacks. (Fixed the same day: entities made storage-neutral, offline rewritten for IndexedDB + outbox, tie rule moved to open, schema checks added to database.md.)
