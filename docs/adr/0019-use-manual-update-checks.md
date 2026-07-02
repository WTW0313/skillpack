# Use manual update checks

Skillpack v1 will not check skills.sh updates automatically on startup. The TUI should load local inventory first and let users explicitly run update checks from a focused action on a skills.sh-managed Global Skill, avoiding startup delays and network failures in the primary inventory experience. Provider rows that reference shared Global Skill content may show provenance, but update actions belong to the Global Skill row; the main inventory list should not expose a generic update shortcut.
