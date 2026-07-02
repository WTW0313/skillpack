# Use Provider Instance rows with relationship-aware ordering

Skillpack's primary inventory view will render Provider Instances as the actionable top-level rows, superseding ADR-0012's Skill Group row model. Skill Groups remain useful relationship objects for detail views and ordering, but the main list should not hide provider-specific availability, provenance, or actions behind an abstract group row.

Provider Instance rows in the All view should use relationship-aware ordering: related instances are clustered near each other when possible, while provider tabs still filter to the provider-specific inventory. The main list may show a lightweight Related Providers hint for confirmed relationships only. Weak name-only relationships are detail-level context, not main-list grouping evidence.
