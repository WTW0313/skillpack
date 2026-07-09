# Use source path in Skill Usage rows

Skillpack will group Skill Usage table rows by skill name and Skill Source Path, and will show Source Path instead of current/historical status. Skill Usage should report what provider session evidence says was invoked, not whether the invoked skill is currently discovered by Skill Inventory or Project Skills scanning.

This supersedes ADR-0048. Current/historical labeling was too dependent on configured scan roots: a valid Project Skill invoked from a repository outside the current scan set could be labeled historical even though the invocation evidence contained the exact skill path. Source Path keeps deleted, moved, unscanned, and project-local skills visible without turning Usage into an Inventory status view.
