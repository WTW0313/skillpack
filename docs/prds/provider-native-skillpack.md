# PRD: Provider-Native Skillpack

## Problem Statement

Users have skills scattered across Codex, Cursor, Claude, Global skills from skills.sh, and project repositories. Each provider has different loading rules, filesystem locations, metadata conventions, and lifecycle behavior. The current Skillpack experience mixes inventory, authoring, remote installs, and provider-local destructive actions, which makes it harder for users to understand what skills they actually have and what is safe to change.

Users need a trustworthy TUI that first explains their Skill Inventory, then exposes only provider-safe lifecycle actions.

## Solution

Refactor Skillpack into an understanding-first, provider-native management console.

Skillpack will scan each Skill Provider according to that provider's own rules, group provider instances into Skill Groups using provenance-aware Skill Identity, and surface deterministic Health Signals. It will not edit or create skills. It will install, update, and remove only Global Skills managed by skills.sh. Codex, Cursor, and Claude provider-local skills can be scanned and enabled/disabled, but not removed, updated, edited, or created. Project Skills are shown in a separate read-only view because they are maintained by repository authors through git.

## User Stories

1. As a Skillpack user, I want to open the TUI and immediately see my cross-provider Skill Inventory, so that I understand what skills exist before changing anything.
2. As a Skillpack user, I want related provider instances grouped into one Skill Group, so that duplicate or shared skills are obvious.
3. As a Skillpack user, I want each Skill Group to show provider badges, so that I can see whether Codex, Cursor, Claude, or Global can load it.
4. As a Skillpack user, I want enabled and disabled states shown per provider, so that I know which agents can currently load a skill.
5. As a Skillpack user, I want Skill Identity confidence shown, so that I know whether a group is confirmed by provenance or inferred by name.
6. As a Skillpack user, I want Health Signals shown in the inventory, so that broken or stale skills are visible without opening every detail view.
7. As a Skillpack user, I want to open a Skill Group detail view, so that I can inspect each provider instance before acting.
8. As a Skillpack user, I want detail views to show paths and resolved paths, so that symlinked or shared skills are understandable.
9. As a Skillpack user, I want detail views to show skills.sh metadata when available, so that Global Skill provenance is clear.
10. As a Skillpack user, I want actions to appear only when valid for the selected provider instance, so that I do not accidentally perform unsupported operations.
11. As a Skillpack user, I want to enable or disable a Codex skill using the safest known provider strategy, so that Codex loading behavior changes predictably.
12. As a Skillpack user, I want to enable or disable a Cursor skill using the safest known provider strategy, so that Cursor loading behavior changes predictably.
13. As a Skillpack user, I want to enable or disable a Claude skill using the safest known provider strategy, so that Claude loading behavior changes predictably.
14. As a Skillpack user, I want `.disabled-` renaming used only as a fallback, so that Skillpack does not ignore known provider configuration mechanisms.
15. As a Skillpack user, I want Project Skills in a separate read-only section, so that project-owned git-maintained skills are not confused with controllable provider skills.
16. As a Skillpack user, I want Project Skills to show basic validity and paths, so that I can understand what the current repository contributes.
17. As a Skillpack user, I want Skillpack to never mutate Project Skills, so that repository authors remain responsible for them through git.
18. As a Skillpack user, I want to install Global Skills through skills.sh, so that installation follows the ecosystem's lifecycle and metadata.
19. As a Skillpack user, I want arbitrary GitHub installs excluded from v1, so that Skillpack does not become a second package manager.
20. As a Skillpack user, I want to remove only skills.sh-managed Global Skills, so that destructive removal is tied to external provenance.
21. As a Skillpack user, I want to manually check for updates, so that opening the TUI is fast and does not depend on network calls.
22. As a Skillpack user, I want the Updates section to show "not checked" before I run a check, so that update freshness is not implied.
23. As a Skillpack user, I want to update skills.sh-managed Global Skills after a manual check, so that I control when remote changes are applied.
24. As a Skillpack user, I want unmanaged Global Skills called out, so that I know which Global Skills lack skills.sh lock metadata.
25. As a Skillpack user, I want invalid `SKILL.md` files surfaced as Health Signals, so that broken skills are visible.
26. As a Skillpack user, I want broken symlinks surfaced as Health Signals, so that filesystem problems are visible.
27. As a Skillpack user, I want provider paths auto-detected, so that Skillpack works without setup for common installations.
28. As a Skillpack user, I want provider paths configurable, so that custom installations can still be scanned.
29. As a Skillpack user, I want no skill editing UI, so that Skillpack stays focused on management and inventory.
30. As a Skillpack user, I want no skill creation UI, so that authoring remains outside Skillpack.
31. As a maintainer, I want core inventory derivation tested independently of the TUI, so that behavior remains stable as the interface changes.
32. As a maintainer, I want provider lifecycle capabilities represented explicitly, so that unsupported actions cannot leak into the UI.
33. As a maintainer, I want skills.sh interactions isolated, so that external CLI behavior is easy to test and mock.
34. As a maintainer, I want Project Skill scanning separated from controllable inventory scanning, so that read-only ownership is enforced in code.

## Implementation Decisions

- Skillpack is a provider-native management console, not the canonical owner of skill content.
- The primary TUI experience is the Skill Inventory.
- The top-level TUI sections are Inventory, Project Skills, Install, and Updates.
- Inventory rows are Skill Groups, not provider-instance rows.
- Skill Groups are built from provenance-aware Skill Identity.
- Normalized-name grouping is a fallback and should be marked as inferred.
- Health Signals are deterministic only in v1.
- LLM-generated advisory guidance is deferred.
- Project Skills are read-only and shown in a separate section.
- Editing and creating skills are out of scope.
- GitHub installs are out of scope.
- V1 installs use skills.sh only and install into Global Skills only.
- Codex, Cursor, and Claude support scan plus enable/disable only.
- Global Skills support scan, enable/disable, install, update, and remove when managed through skills.sh.
- Provider-local destructive removal is out of scope.
- Enable/disable uses provider-specific Disable Strategies; `.disabled-` renaming is fallback behavior only when no known provider mechanism exists.
- Update checks are manual and should not block startup.
- Provider paths are auto-detected with configurable overrides.
- Detail views follow explain-before-action.

## Testing Decisions

- The highest-value testing seam is the core inventory derivation API: provider instances in, Skill Groups, Project Skills, actions, and Health Signals out.
- Provider tests should cover scan behavior, enabled/disabled detection, symlink handling, invalid skills, and disable strategies.
- Manager-level tests should verify action availability and lifecycle routing, not implementation details.
- skills.sh source tests should mock CLI behavior and verify install/update/remove/check semantics.
- Project Skill tests should assert that Project Skills are discoverable but expose no mutation actions.
- Existing Vitest coverage in core should be extended and reshaped around the new inventory model.
- TUI verification can remain manual for v1 unless a dedicated Ink test harness is introduced.

## Out of Scope

- Editing existing skills.
- Creating new skills.
- Arbitrary GitHub installs.
- Copying, importing, or forking skills between providers.
- Removing provider-local Codex, Cursor, or Claude skills.
- Mutating Project Skills.
- LLM best-practice recommendations.
- Security or risk scoring.
- Automatic update checks on startup.
- Full TUI automated test harness.

## Further Notes

This PRD supersedes the earlier central Skill Library direction. The accepted direction is provider-native state with a trustworthy inventory and constrained lifecycle actions.

The corresponding refactor spec is `docs/specs/provider-native-skillpack-refactor.md`.
