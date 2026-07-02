# Provider-Native Skillpack Refactor Spec

## Purpose

Refactor Skillpack into an understanding-first TUI for managing agent skills across Codex, Claude, Global skills from skills.sh, and read-only Project Skills.

Skillpack should not become the canonical owner of skill content. Each Skill Provider keeps its provider-native state. Skillpack scans that state, renders provider instances as the actionable Skill Inventory rows, uses Skill Groups as relationship context, exposes deterministic Inventory Issues separately from Inventory Notices, and allows only the lifecycle actions that are safe for each provider.

## Product Shape

The TUI has five top-level sections:

- **Inventory**: provider-instance list for Codex, Claude, and Global, ordered with relationship context.
- **Project Skills**: read-only inventory of skills stored in the current project repository.
- **Settings**: read-only configuration diagnostics, including Scan Roots, providers, and sources.
- **Install**: skills.sh search and install into Global Skills only.
- **Updates**: manual update checks and updates for skills.sh-managed Global Skills.

The main experience is Inventory. It should answer:

- Which skills exist?
- Which providers can load them?
- Are they enabled or disabled?
- Which provider instances have confirmed related providers?
- Which relationships are only weak name matches?
- Are any provider instances broken?
- Which provider instances have non-problem notices such as unmanaged provenance or available updates?

## Scope

In scope:

- Scan Codex, Claude, Global, and Project Skill locations using provider-specific rules.
- Scan Codex provider-local skills from `~/.codex/skills` and active-looking Codex plugin skills from `~/.codex/plugins/cache` by default. Stale or duplicate cached plugin copies should not appear in the main inventory by default.
- Build Skill Groups from provider instances using provenance-aware Skill Identity as relationship context.
- Show provider, availability state, confirmed related providers, and Inventory Issues in the main Inventory.
- Show weak name-only relationships and Inventory Notices in detail views.
- Show Project Skills in a separate read-only view.
- Show Scan Roots in a separate read-only Settings view instead of inline in Inventory.
- Enable or disable Codex and Claude provider instances through provider-specific Disable Strategies.
- Use `.disabled-` renaming only when no known provider config or native disable mechanism exists.
- Install Global Skills through skills.sh only.
- Remove and update skills.sh-managed Global Skills through skills.sh only.
- Manual update checks only.
- Configurable provider paths with auto-detected defaults.

Out of scope:

- Editing skills.
- Creating new skills.
- Arbitrary GitHub installs.
- Copying, importing, or forking skills between providers.
- Removing provider-local Codex or Claude skills.
- LLM-generated advisory guidance or security scoring.
- Automatic update checks on startup.
- Controlling Project Skills.

## Domain Model

### Skill Provider

A provider-native source of skill state. V1 providers:

- Codex
- Claude
- Global / skills.sh
- Project Skills

Project Skills are inventory-only and must not expose lifecycle actions.

### Provider Instance

A discovered skill in one provider. It includes:

- provider ID
- provider display name
- path
- resolved path when symlinked
- parsed SKILL.md metadata when valid
- enabled/disabled state
- source/provenance metadata
- Inventory Issues
- Inventory Notices
- supported actions

### Scan Root

A configured or default directory Skillpack inspects during scan. Settings should show:

- provider or project scope
- path
- exists/missing state
- root kind
- provider enabled state when applicable

Settings is read-only in v1. Editing Scan Roots requires a separate design for validation, persistence, and reset-to-default behavior.

Read-only Settings should show only configuration diagnostics already available in memory:

- Scan Roots with scope, provider when present, kind, path, and exists/missing state
- Providers with provider ID, enabled/disabled config state, and Scan Root count
- Sources with source ID and enabled/disabled config state

Settings should not show editable JSON, raw config file contents, or provider-native config internals in v1.

### Skill Group

A relationship object that contains provider instances believed to represent the same Skill. Skill Groups support detail context and relationship-aware ordering, but they are not the primary Inventory row.

Grouping confidence should be explicit:

- **confirmed**: shared real path, skills.sh lock metadata, or known source identity ties instances together.
- **inferred**: normalized names match, but provenance is unavailable.

### Inventory Issue

V1 Inventory Issues are deterministic findings that affect safe operation or likely require attention:

- missing or invalid `SKILL.md`
- broken symlink
- provider/plugin identity mismatch

Security/risk scoring is out of scope.

### Inventory Notice

Inventory Notices are non-problem context. They should not render as warnings in the main list.

- confirmed related providers
- weak name-only relationships
- skills.sh update available
- unmanaged Global Skill without skills.sh lock metadata

### Disable Strategy

Each provider adapter owns enable/disable behavior. A strategy should prefer known provider-native config mechanisms. Provider config determines Skill Availability when a provider has a known config file or native disable mechanism. `.disabled-` directory renaming is a fallback only when a scanned location has no provider-specific mechanism.

Known v1 strategies:

- Codex provider-local skills: read/write `[[skills.config]]` entries in `~/.codex/config.toml`, keyed by absolute `SKILL.md` path.
- Codex plugin skills: read/write `[plugins."plugin-name@marketplace-name"]` in `~/.codex/config.toml`, when the plugin ID is inferable from the cache path. Skill Availability is `plugin enabled AND skill config not false`; toggling a plugin-owned skill toggles the owning plugin and affects all skills from that plugin.
- Claude regular skills: read/write `skillOverrides` in Claude `settings.json`, keyed by skill name.
- Claude plugin skills: read/write `enabledPlugins` in Claude `settings.json`, keyed by `plugin-name@marketplace-name`, when the plugin ID is inferable from the cache path.
- Global / skills.sh: no enable/disable strategy. Global Skills are Shared Skill Content and expose install, update, and remove lifecycle actions only.

Plugin-level toggles require confirmation in the TUI. The confirmation must name the owning plugin and show the sibling skills affected by the same plugin availability gate.

Codex plugin cache scanning should select active-looking plugin roots for the main inventory:

- Build candidates from `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`.
- Include candidates whose `plugin@marketplace` appears in `~/.codex/config.toml`, even when disabled.
- Include remote-installed or bundled candidates without a config entry only when another root has not already been selected for the same plugin name.
- If multiple versions exist for the same `plugin@marketplace`, select the highest semantic version; for non-semver versions, select the newest modified root.
- Hide non-selected cached copies from the main inventory for now.

A missing Codex plugin config entry means the active-looking plugin root is enabled by default. Disabling such a plugin writes a new `[plugins."plugin-name@marketplace-name"]` table with `enabled = false`.

## Provider Capabilities

| Provider | Scan | Enable/disable | Install | Update | Remove | Edit/Create |
| --- | --- | --- | --- | --- | --- | --- |
| Codex | yes | yes | no | no | no | no |
| Claude | yes | yes | no | no | no | no |
| Global / skills.sh | yes | no | yes | yes | yes | no |
| Project Skills | yes | no | no | no | no | no |

## TUI Behavior

### Inventory

Rows are Provider Instances. Skill Groups remain relationship context for ordering and detail views.

Recommended columns:

- name
- provider
- enabled/disabled state
- confirmed related providers
- Inventory Issue

Provider filters can exist inside Inventory:

- All
- Codex
- Claude
- Global

### Detail View

The detail view uses an explain-before-action pattern:

- summary
- Skill Identity confidence
- description
- provider instances
- path and resolved path
- enabled/disabled state
- Disable Strategy
- Inventory Issues
- Inventory Notices
- skills.sh metadata when present
- actions valid for the selected provider instance

No action should appear unless the selected provider instance supports it.

### Project Skills

Project Skills appear in a separate read-only section. They should show:

- name
- project-relative path
- description
- validity of `SKILL.md`
- whether the skill name overlaps with non-project Provider Instances

No mutation actions are available.

### Install

Install uses skills.sh only:

- search through skills.sh
- select result
- install into Global Skills
- refresh inventory

No GitHub install path exists in v1.

### Updates

Updates are manual:

- initial state is "not checked"
- user triggers a skills.sh update check
- results show available updates for skills.sh-managed Global Skills
- user applies updates explicitly
- inventory refreshes after update

## Core Refactor Notes

The current core model is provider-centric and action-heavy. The refactor should reshape it around inventory facts:

- Replace duplicate-only grouping with relationship-aware Skill Group construction.
- Replace provider capabilities with action availability per provider instance.
- Remove create/edit APIs from the manager and TUI.
- Remove GitHub install source from v1 registration and UI.
- Restrict provider-local uninstall/update.
- Preserve skills.sh metadata hydration for Global Skills.
- Make Project Skill scanning read-only and visually separate from Inventory.

## Testing Strategy

Use core tests as the primary seam. The most valuable external behavior tests are:

- provider scanning returns provider instances with availability state and paths
- disable strategies toggle through provider-supported config behavior, falling back to `.disabled-` only when no provider config mechanism is known
- Skill Identity groups confirmed and inferred instances correctly
- Project Skills are excluded from controllable Inventory and appear in read-only Project Skills output
- skills.sh-managed Global Skills expose install/update/remove actions
- provider-local Codex/Claude skills do not expose remove/update/install/edit/create actions
- invalid skills and broken symlinks produce Inventory Issues instead of silently disappearing

TUI tests do not exist yet. V1 can keep TUI verification manual unless a test harness is introduced, but the core should expose enough derived state that the TUI remains thin.
