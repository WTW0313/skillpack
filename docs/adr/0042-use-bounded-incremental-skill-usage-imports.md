# Use bounded incremental Skill Usage imports

Skillpack will run a cheap incremental Skill Usage Import on startup using provider-specific Usage Import Cursors, and expose deeper rescans from the Usage view for selected time ranges. This keeps usage data current during normal app launches without making inventory refresh depend on repeatedly parsing all provider session artifacts.

Cursors include a provider-specific importer version as well as source artifact size and mtime. When a parser bug is fixed or one provider adapter starts recognizing additional real session evidence, Skillpack invalidates only that provider's old cursor and rescans its unchanged artifacts once without requiring users to reset derived usage data or rebuild unrelated providers.

The current importer-version mapping is Codex `9` and Claude `8`. Codex moved from `8` to `9` when current orchestrated `custom_tool_call` / `exec` envelopes became supported; Claude remains at `8` because its parser and identity rules did not change.

Provider invocation identity and deduplication changes also increment that provider's importer version. Its stale provider partitions are rebuilt before reimport so obsolete Invocation Record IDs cannot coexist with records generated under the corrected identity rule.

After consent, a provider's first supported import scans all known artifacts and retains every recoverable invocation, even when the current Usage view shows a shorter date range. Later imports use cursors; display ranges are query boundaries, not retention boundaries.

Startup import failures are recorded in the Usage view state and surfaced when the user opens Skill Usage; they do not block normal inventory startup.
