# Use source path in Skill Usage rows

Skillpack will group Skill Usage table rows by skill name and Skill Source Path, and will show Source Path instead of current/historical status. Skill Usage should report what provider session evidence says was invoked, not whether the invoked skill is currently discovered by Skill Inventory or Project Skills scanning.

This supersedes ADR-0048. Current/historical labeling was too dependent on configured scan roots: a valid Project Skill invoked from a repository outside the current scan set could be labeled historical even though the invocation evidence contained the exact skill path. Source Path keeps deleted, moved, unscanned, and project-local skills visible without turning Usage into an Inventory status view.

When a provider-facing skill path is a symlink, Skillpack retains that path for display and retains the resolved target separately for identity and deduplication. Skill Source Identity prefers the resolved target whenever available and falls back to the provider-facing path. The provider-facing path explains where the provider discovered the skill; the resolved path prevents aliases to the same content from becoming false duplicate identities.

Source attribution collapses candidate aliases by resolved target. If several provider-facing paths resolve to one target, Skillpack retains the common resolved path and leaves the provider-facing path blank unless it is unique; only distinct resolved targets make the source fully ambiguous.

Aggregation applies the same rule across invocation records: show one common provider-facing path when every record agrees, otherwise show one common resolved target when every record agrees, and otherwise leave Source Path blank. Skill Source Identity remains separate from this display choice.

ADR-0060 narrows path-based grouping for versioned Codex plugin caches: cache versions of one stable Plugin-Owned Skill aggregate into one row rather than appearing as separate sources.
