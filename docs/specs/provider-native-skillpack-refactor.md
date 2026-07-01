# Provider-Native Skillpack Refactor Spec

## Purpose

Refactor Skillpack into an understanding-first TUI for managing agent skills across Codex, Claude, Global skills from skills.sh, and read-only Project Skills.

Skillpack should not become the canonical owner of skill content. Each Skill Provider keeps its provider-native state. Skillpack scans that state, groups related instances into a Skill Inventory, exposes deterministic Health Signals, and allows only the lifecycle actions that are safe for each provider.

## Product Shape

The TUI has four top-level sections:

- **Inventory**: grouped view of provider-native skills from Codex, Claude, and Global.
- **Project Skills**: read-only inventory of skills stored in the current project repository.
- **Install**: skills.sh search and install into Global Skills only.
- **Updates**: manual update checks and updates for skills.sh-managed Global Skills.

The main experience is Inventory. It should answer:

- Which skills exist?
- Which providers can load them?
- Are they enabled or disabled?
- Are grouped instances confirmed by provenance or inferred by name?
- Are any provider instances broken, unmanaged, duplicated, or stale?

## Scope

In scope:

- Scan Codex, Claude, Global, and Project Skill locations using provider-specific rules.
- Scan Codex provider-local skills from `~/.codex/skills` and active-looking Codex plugin skills from `~/.codex/plugins/cache` by default. Stale or duplicate cached plugin copies should not appear in the main inventory by default.
- Build Skill Groups from provider instances using provenance-aware Skill Identity.
- Show provider badges, Health Signals, and provenance summaries in the main Inventory.
- Show Project Skills in a separate read-only view.
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
- Health Signals
- supported actions

### Skill Group

The primary Inventory row. A Skill Group contains provider instances that likely represent the same Skill.

Grouping confidence should be explicit:

- **confirmed**: shared real path, skills.sh lock metadata, or known source identity ties instances together.
- **inferred**: normalized names match, but provenance is unavailable.

### Health Signal

V1 Health Signals are deterministic:

- grouped across multiple providers
- inferred identity
- enabled or disabled per provider
- missing or invalid `SKILL.md`
- broken symlink
- skills.sh update available
- unmanaged Global Skill without skills.sh lock metadata

Security/risk scoring is out of scope.

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

Rows are Skill Groups, not individual provider instances.

Recommended columns:

- name
- provider badges with enabled/disabled state
- Health Signals
- source/provenance summary

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
- Health Signals
- skills.sh metadata when present
- actions valid for the selected provider instance

No action should appear unless the selected provider instance supports it.

### Project Skills

Project Skills appear in a separate read-only section. They should show:

- name
- project-relative path
- description
- validity of `SKILL.md`
- whether the skill name overlaps with non-project Skill Groups

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

- Replace duplicate-only grouping with Skill Group construction.
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
- invalid skills and broken symlinks produce Health Signals instead of silently disappearing

TUI tests do not exist yet. V1 can keep TUI verification manual unless a test harness is introduced, but the core should expose enough derived state that the TUI remains thin.
