# Use provider-specific Disable Strategies

Skillpack will implement enable/disable through provider-specific Disable Strategies. A provider adapter should use a known provider configuration mechanism when one exists, and use `.disabled-` directory renaming only as a fallback when a scanned location has no known config or native disable mechanism for skills.

For Codex, Skill Availability is controlled through `[[skills.config]]` entries in `~/.codex/config.toml` keyed by absolute `SKILL.md` path, so Codex toggles must patch that config instead of renaming skill directories.

For Claude, regular skills under `~/.claude/skills` are controlled by `skillOverrides` in Claude `settings.json`; Skillpack disables them with `"off"` and enables them with `"on"`. Claude plugin skills are not affected by `skillOverrides`, so Skillpack reads and writes the owning plugin's `enabledPlugins["plugin-name@marketplace-name"]` setting when it can infer the plugin ID from the cache path.
