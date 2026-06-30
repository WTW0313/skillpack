# Restrict provider-local mutations

Skillpack v1 will treat Codex, Cursor, and Claude as scan plus enable/disable Skill Providers only. Global Skills managed through skills.sh are the only skills with install, update, and remove lifecycle actions, keeping destructive operations tied to external provenance and avoiding accidental deletion of provider-local content.
