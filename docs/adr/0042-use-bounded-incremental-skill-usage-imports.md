# Use bounded incremental Skill Usage imports

Skillpack will run a cheap incremental Skill Usage Import on startup using provider-specific Usage Import Cursors, and expose deeper rescans from the Usage view for selected time ranges. This keeps usage data current during normal app launches without making inventory refresh depend on repeatedly parsing all provider session artifacts.

Cursors include an importer version as well as source artifact size and mtime. When a parser bug is fixed or a provider adapter starts recognizing additional real session evidence, Skillpack can invalidate old cursors and rescan unchanged artifacts once without requiring users to reset derived usage data.

Startup import failures are recorded in the Usage view state and surfaced when the user opens Skill Usage; they do not block normal inventory startup.
