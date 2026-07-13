# Fold Codex plugin cache versions in Skill Usage

Skillpack will aggregate Codex Plugin-Owned Skill usage by stable marketplace, plugin, and skill-relative path, ignoring the version or content-hash directory between the plugin name and its `skills` directory. Plugin upgrades replace cache locations without changing the invoked skill's logical identity, so grouping by the complete cache path creates duplicate ranking and selected-day rows.

This normalized plugin identity takes precedence over a record's resolved target. Cache versions are distinct real directories by construction, so generic resolved-path identity would defeat version folding.

This exception applies only to recognized paths under `.codex/plugins/cache/<marketplace>/<plugin>/<version>/skills/`. Ordinary user, project, and provider-local paths continue to use the complete Skill Source Path, and different marketplaces remain distinct.

When an aggregate contains records from more than one concrete cache path, Skillpack leaves its displayed Skill Source Path blank. Every invocation record retains its original path; only aggregate identity and presentation change.
