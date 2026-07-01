# Use provider-specific Disable Strategies

Skillpack will implement enable/disable through provider-specific Disable Strategies. A provider adapter should use a known provider configuration mechanism when one exists, and use `.disabled-` directory renaming only as a fallback when a scanned provider-owned location has no known config or native disable mechanism for skills.

For Codex provider-local skills, Skill Availability is controlled through `[[skills.config]]` entries in `~/.codex/config.toml` keyed by absolute `SKILL.md` path, so Codex toggles must patch that config instead of renaming skill directories.

For Codex Plugin-Owned Skills, availability is the conjunction of the owning plugin's access state and any per-skill config override. The owning plugin's access state is controlled through `[plugins."plugin-name@marketplace-name"]` in `~/.codex/config.toml`. Skillpack toggles plugin-owned Codex skills by writing that plugin entry, and the TUI must make clear that the action affects every skill distributed by the same plugin.

For Claude, regular skills under `~/.claude/skills` are controlled by `skillOverrides` in Claude `settings.json`; Skillpack disables them with `"off"` and enables them with `"on"`. Claude plugin skills are not affected by `skillOverrides`, so Skillpack reads and writes the owning plugin's `enabledPlugins["plugin-name@marketplace-name"]` setting when it can infer the plugin ID from the cache path.

Global Skills are Shared Skill Content. Skillpack must not disable a Global Skill by renaming its directory, because Codex or Claude provider instances may be symlinks to that same directory. Global Skills expose install, update, and remove lifecycle actions only.
