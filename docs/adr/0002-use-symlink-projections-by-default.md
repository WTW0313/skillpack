---
status: superseded by ADR-0005
---

# Use symlink projections by default

Skillpack will project activated skills into provider directories as symlinks by default, falling back to physical copies only when a provider cannot follow symlinks. This keeps the Skill Library as the single canonical content location and avoids copy drift, while still leaving an escape hatch for provider-specific filesystem constraints.
