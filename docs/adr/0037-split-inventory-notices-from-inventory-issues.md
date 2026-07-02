# Split Inventory Notices from Inventory Issues

Skillpack will replace the broad Health Signal bucket with Inventory Notices and Inventory Issues. Notices are non-problem context such as update opportunities, unmanaged local provenance, and weak name-only relationships; Issues are deterministic findings that directly affect safe operation or require attention, such as invalid `SKILL.md` files, broken symlinks, or provider state that conflicts with the filesystem.

This split prevents the main inventory from warning on normal skill states while still making genuinely actionable problems visible without requiring the user to open every detail view.
