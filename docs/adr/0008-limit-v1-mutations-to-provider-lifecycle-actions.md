# Limit v1 mutations to provider lifecycle actions

Skillpack v1 will support enable/disable, skills.sh installation into Global skills, uninstall/removal, and update operations where the underlying provider supports them. It will not copy, import, or fork skills between providers in v1, because those workflows blur provider ownership and recreate duplicate drift that the inventory experience should instead make visible.
