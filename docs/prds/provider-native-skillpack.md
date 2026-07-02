# PRD: Provider-Native Skillpack

## Problem Statement

Users have skills scattered across Codex, Claude, Global skills from skills.sh, and project repositories. Each provider has different loading rules, filesystem locations, metadata conventions, and lifecycle behavior. The current Skillpack experience mixes inventory, authoring, remote installs, and provider-local destructive actions, which makes it harder for users to understand what skills they actually have and what is safe to change.

Users need a trustworthy TUI that first explains their Skill Inventory, then exposes only provider-safe lifecycle actions.

## Solution

Refactor Skillpack into an understanding-first, provider-native management console.

Skillpack will scan each Skill Provider according to that provider's own rules, render provider instances as the primary Inventory rows, use Skill Groups as relationship context, and surface deterministic Inventory Issues separately from lower-priority Inventory Notices. It will not edit or create skills. It will install, update, and remove only Global Skills managed by skills.sh. Codex and Claude provider-local skills can be scanned and enabled/disabled, but not removed, updated, edited, or created. Project Skills are shown in a separate read-only view because they are maintained by repository authors through git.

## User Stories

1. As a Skillpack user, I want to open the TUI and immediately see my cross-provider Skill Inventory, so that I understand what skills exist before changing anything.
2. As a Skillpack user, I want each provider instance to be an actionable Inventory row, so that provider-specific state and actions are not hidden behind a group.
3. As a Skillpack user, I want confirmed related providers shown as a lightweight row hint, so that duplicate or shared skills are obvious without making Skill Groups the primary row.
4. As a Skillpack user, I want enabled and disabled states shown per provider, so that I know which agents can currently load a skill.
5. As a Skillpack user, I want Skill Identity confidence shown in detail, so that I know whether relationships are confirmed by provenance or inferred by name.
6. As a Skillpack user, I want Inventory Issues shown in the main list, so that broken skills are visible without opening every detail view.
7. As a Skillpack user, I want to open a provider instance detail view, so that I can inspect its relationship context before acting.
8. As a Skillpack user, I want detail views to show paths and resolved paths, so that symlinked or shared skills are understandable.
9. As a Skillpack user, I want detail views to show skills.sh metadata when available, so that Global Skill provenance is clear.
10. As a Skillpack user, I want actions to appear only when valid for the selected provider instance, so that I do not accidentally perform unsupported operations.
11. As a Skillpack user, I want to enable or disable a Codex skill using the safest known provider strategy, so that Codex loading behavior changes predictably.
12. As a Skillpack user, I want to enable or disable a Claude skill using the safest known provider strategy, so that Claude loading behavior changes predictably.
13. As a Skillpack user, I want `.disabled-` renaming used only as a fallback, so that Skillpack does not ignore known provider configuration mechanisms.
14. As a Skillpack user, I want Project Skills in a separate read-only section, so that project-owned git-maintained skills are not confused with controllable provider skills.
15. As a Skillpack user, I want Project Skills to show basic validity and paths, so that I can understand what the current repository contributes.
16. As a Skillpack user, I want Skillpack to never mutate Project Skills, so that repository authors remain responsible for them through git.
17. As a Skillpack user, I want to install Global Skills through skills.sh, so that installation follows the ecosystem's lifecycle and metadata.
18. As a Skillpack user, I want arbitrary GitHub installs excluded from v1, so that Skillpack does not become a second package manager.
19. As a Skillpack user, I want to remove only skills.sh-managed Global Skills, so that destructive removal is tied to external provenance.
20. As a Skillpack user, I want to manually check for updates, so that opening the TUI is fast and does not depend on network calls.
21. As a Skillpack user, I want the Updates section to show "not checked" before I run a check, so that update freshness is not implied.
22. As a Skillpack user, I want to update skills.sh-managed Global Skills after a manual check, so that I control when remote changes are applied.
23. As a Skillpack user, I want unmanaged Global Skills shown as notices, so that I know which Global Skills lack skills.sh lock metadata without treating that as a warning.
24. As a Skillpack user, I want invalid `SKILL.md` files surfaced as Inventory Issues, so that broken skills are visible.
25. As a Skillpack user, I want broken symlinks surfaced as Inventory Issues, so that filesystem problems are visible.
26. As a Skillpack user, I want provider paths auto-detected, so that Skillpack works without setup for common installations.
27. As a Skillpack user, I want provider paths configurable, so that custom installations can still be scanned.
28. As a Skillpack user, I want Scan Roots shown in a separate Settings section, so that Inventory stays focused on skills.
29. As a Skillpack user, I want Settings to show provider and project Scan Roots with exists/missing status, so that I can diagnose why skills are or are not discovered.
30. As a Skillpack user, I want Settings to be read-only in v1, so that configuration editing is not mixed with inventory operations before validation and persistence rules are designed.
31. As a Skillpack user, I want no skill editing UI, so that Skillpack stays focused on management and inventory.
32. As a Skillpack user, I want no skill creation UI, so that authoring remains outside Skillpack.
33. As a maintainer, I want core inventory derivation tested independently of the TUI, so that behavior remains stable as the interface changes.
34. As a maintainer, I want provider lifecycle capabilities represented explicitly, so that unsupported actions cannot leak into the UI.
35. As a maintainer, I want skills.sh interactions isolated, so that external CLI behavior is easy to test and mock.
36. As a maintainer, I want Project Skill scanning separated from controllable inventory scanning, so that read-only ownership is enforced in code.

## Implementation Decisions

- Skillpack is a provider-native management console, not the canonical owner of skill content.
- The primary TUI experience is the Skill Inventory.
- The top-level TUI sections are Inventory, Project Skills, Settings, Install, and Updates.
- Inventory rows are Provider Instances, not Skill Groups.
- Skill Groups are relationship objects built from provenance-aware Skill Identity.
- The All view uses relationship-aware ordering so related Provider Instance rows stay near each other.
- Normalized-name relationships are weak and should be shown only in detail.
- Inventory Issues are deterministic only in v1; non-problem context is shown as Inventory Notices.
- LLM-generated advisory guidance is deferred.
- Project Skills are read-only and shown in a separate section.
- Editing and creating skills are out of scope.
- GitHub installs are out of scope.
- V1 installs use skills.sh only and install into Global Skills only.
- Codex and Claude support scan plus enable/disable only.
- Global Skills support scan, install, update, and remove when managed through skills.sh. They do not support enable/disable because their directories are Shared Skill Content that provider-specific instances may reference.
- Provider-local destructive removal is out of scope.
- Enable/disable uses provider-specific Disable Strategies. Codex provider-local skills use `~/.codex/config.toml` `[[skills.config]]` entries keyed by absolute `SKILL.md` path. Codex plugin skills use the owning plugin's `[plugins."plugin-name@marketplace-name"]` entry, with availability determined by `plugin enabled AND skill config not false`. Claude regular skills use `skillOverrides` in Claude `settings.json`; Claude plugin skills use the owning plugin's `enabledPlugins` setting when Skillpack can infer the plugin ID. `.disabled-` renaming is fallback behavior only for provider-owned locations with no known provider mechanism; it is not used for Global Skills.
- Update checks are manual and should not block startup.
- Provider paths are auto-detected with configurable overrides.
- Scan Roots are shown in read-only Settings, not inline in Inventory.
- Detail views follow explain-before-action.

## Testing Decisions

- The highest-value testing seam is the core inventory derivation API: provider instances in, Skill Groups, Project Skills, actions, Inventory Issues, and Inventory Notices out.
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
- Removing provider-local Codex or Claude skills.
- Mutating Project Skills.
- LLM best-practice recommendations.
- Security or risk scoring.
- Automatic update checks on startup.
- Full TUI automated test harness.

## Further Notes

This PRD supersedes the earlier central Skill Library direction. The accepted direction is provider-native state with a trustworthy inventory and constrained lifecycle actions.

The corresponding refactor spec is `docs/specs/provider-native-skillpack-refactor.md`.
