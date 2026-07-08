# Use JSONL for Skill Usage Records

Skillpack will store Skill Invocation Records in an append-only Skill Usage Log using JSONL files partitioned by Session-Producing Provider and month. JSONL avoids native database dependencies for the `npx`-distributed TUI, is easy to inspect and test, and is sufficient for the default 7-day top-10 usage aggregate; a future migration to SQLite can be considered if range queries become too slow.
