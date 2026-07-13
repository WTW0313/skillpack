# Use JSONL for Skill Usage Records

Skillpack will store Skill Invocation Records in an append-only Skill Usage Log using JSONL files partitioned by Session-Producing Provider and month. JSONL avoids native database dependencies for the `npx`-distributed TUI, is easy to inspect and test, and is sufficient for the default 7-day top-10 usage aggregate; a future migration to SQLite can be considered if range queries become too slow.

Range queries will derive the overlapping `YYYY-MM.jsonl` partition names and read only those files. Skillpack owns partition writes, so query performance will not be made unbounded to recover records manually placed in the wrong month.

All revisions of one Invocation Record ID must preserve the provider and `startedAt` month that select its partition. A parser correction that changes either partition key requires importer-version invalidation and a provider partition rebuild.
