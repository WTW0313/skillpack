# Limit v1 mutations to provider lifecycle actions

Skillpack v1 will support enable/disable only for provider-owned Codex and Claude availability state. Global Skills are managed through skills.sh install, update, and remove operations only. Skillpack will not copy, import, or fork skills between providers in v1, because those workflows blur provider ownership and recreate duplicate drift that the inventory experience should instead make visible.
