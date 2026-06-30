# Do not toggle shared Global Skill content

Skillpack will not expose enable/disable actions for Global Skills. Global Skill directories are Shared Skill Content: Codex and Claude provider instances may reference them through symlinks or other provider-native projections. Renaming a Global Skill directory to `.disabled-<name>` would mutate the shared content path and can accidentally break every provider that points at it.

Provider-specific availability must be controlled through provider-specific state instead:

- Codex availability is controlled through `[[skills.config]]` in `~/.codex/config.toml`.
- Claude regular skill availability is controlled through `skillOverrides` in Claude `settings.json`.
- Claude plugin availability is controlled through `enabledPlugins` in Claude `settings.json`.

Global Skills remain manageable through skills.sh lifecycle actions: install, update, and remove. A future "disable everywhere" action, if needed, should be explicit and should update each provider's availability config rather than renaming the shared Global Skill directory.
