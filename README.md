# Skillpack

![NPM Downloads](https://img.shields.io/npm/dm/skillpack-tui?style=flat-square&color=%23085afc&link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2Fskillpack-tui)

Unified TUI manager for agent skills across Codex, Claude, and Global (`~/.agents/skills`).

## Features

- **Multi-platform scanning** — discovers skills from Codex, Codex plugins, Claude, and Global provider locations automatically, with symlink support
- **Project Skills** — scans read-only project skill directories (`.codex/skills`, `.claude/skills`, `.agents/skills`) in a separate view
- **Provider-native availability** — reads provider config when available and uses `.disabled-` renaming only as a fallback
- **Skill Inventory** — groups provider instances by Skill Identity and surfaces deterministic Health Signals
- **Skill Usage** — derives aggregate Codex and Claude skill usage from local session artifacts after explicit consent
- **skills.sh installs** — installs, updates, and removes Global Skills through the skills.sh CLI
- **Manual updates** — checks updates only when requested
- **Fuzzy search** — filter skills by name or description
- **Keyboard-driven** — full TUI navigation without a mouse

## Installation

### From npm (recommended)

```bash
npm i -g skillpack-tui
skillpack
```

Or run without installing:

```bash
npx skillpack-tui
```

### From source

```bash
git clone https://github.com/WTW0313/skillpack.git && cd skillpack
pnpm install
pnpm build
node packages/tui/dist/skillpack.js
```

## Quick Start

Launch `skillpack` to see discovered skills grouped into Skill Groups with provider status and Health Signals. Use `↑↓` arrow keys to navigate, `Tab` / `Shift+Tab` to filter by provider (All, Codex, Claude, Global), and `/` to search.

Press `Enter` to inspect a Skill Group, then use left/right to choose a provider instance before taking instance-level actions. Press `g` to open Skill Usage, `p` to inspect read-only Project Skills, `s` to inspect Settings and Scan Roots, `i` to install a skills.sh Global Skill, or `u` to open manual updates. Plugin-owned skills require confirmation because the action toggles the owning plugin and affects sibling skills from the same plugin.

Skill Usage is opt-in. The first time you open it, press `y` to allow Skillpack to derive aggregate usage records from provider session artifacts. Skillpack stores only minimal invocation metadata: skill name, provider, source path, status, and timestamps. It does not store prompts, responses, tool arguments, file contents, or transcripts.

## Keyboard Shortcuts

### List View

| Key | Action | Description |
|-----|--------|-------------|
| `↑` / `↓` | Navigate | Move selection up / down |
| `Enter` | Detail | Open Skill Group detail view |
| `Tab` / `Shift+Tab` | Switch tab | Cycle through All / Codex / Claude / Global |
| `/` | Search | Fuzzy match on name + description |
| `Esc` | Clear search | Clear the active search filter |
| `p` | Project Skills | Open read-only Project Skills view |
| `s` | Settings | Open read-only Settings and Scan Roots view |
| `i` | Install | Install a Global Skill through skills.sh |
| `u` | Updates | Open manual skills.sh updates |
| `g` | Usage | Open opt-in Skill Usage analytics |
| `q` | Quit | Exit skillpack |

### Detail View

| Key | Action | Description |
|-----|--------|-------------|
| `Esc` | Back | Return to list view |
| `←` / `→` | Provider instance | Switch the selected provider instance inside the Skill Group |
| `Space` | Toggle | Enable or disable a Codex or Claude skill; plugin-owned skills ask for confirmation |
| `o` / `O` | Open folder | Open skill directory in system file manager |
| `d` | Delete | Remove a skills.sh-managed Global Skill with confirmation |
| `↑` / `↓` | Scroll | Scroll the description when it overflows |

### Usage View

| Key | Action | Description |
|-----|--------|-------------|
| `y` | Enable import | Grant consent for local Skill Usage import when prompted |
| `Esc` | Back | Return to list view |
| `Tab` / `Shift+Tab` | Provider | Switch between usage providers |
| `1` / `2` / `3` | Range | Show 7 / 30 / 90 days |
| `↑` / `↓` | Day | Move the selected day by one day |
| `←` / `→` | Week | Move the selected day by one week |
| `PageUp` / `PageDown` | Scroll | Scroll long usage reports |
| `Home` / `End` | Jump | Jump to top / bottom of the report |
| `r` | Rescan | Re-import usage from configured artifact roots |
| `x` | Reset | Clear Skillpack's derived local usage records |
| `q` | Quit | Exit skillpack |

## Configuration

Skillpack stores its configuration at `~/.config/skillpack/config.json`. On first run it auto-detects which provider directories exist and enables them.

```json
{
  "editor": "vi",
  "autoCheckUpdates": false,
  "projectSkillsDirs": [
    ".codex/skills",
    ".claude/skills",
    ".agents/skills"
  ],
  "providers": {
    "codex":  { "enabled": true, "paths": ["~/.codex/skills", "~/.codex/plugins/cache"] },
    "claude": { "enabled": true, "paths": ["~/.claude/plugins/cache", "~/.claude/skills"] },
    "global": { "enabled": true, "paths": ["~/.agents/skills"] }
  },
  "sources": {
    "skillssh": { "enabled": true }
  },
  "usage": {
    "importConsent": false,
    "artifactRoots": {
      "codex": [
        "~/.codex/sessions",
        "~/.codex/archived_sessions"
      ],
      "claude": [
        "~/.claude/projects"
      ]
    }
  }
}
```

`usage.importConsent` defaults to `false`. When enabled from the TUI, Skillpack imports supported Codex and Claude artifacts into derived JSONL records under `~/.local/share/skillpack/usage/`. Claude usage is derived from structured `Skill` tool calls that match user-level or plugin-provided skills in configured Claude Scan Roots. Built-In Skills and Claude Project Skills are not counted in the current Claude adapter.

The Settings view shows both Scan Roots and Usage Artifact Roots so you can verify which local directories Skillpack will inspect.

## Adding a Provider

Extend the `BaseProvider` class from `@skillpack/core` (which implements `ISkillProvider` with default scanning and a fallback `.disabled-` prefix rename strategy). Providers with native availability config should override `scan`, `setEnabled`, and `getDisableStrategy` so Skillpack reflects the provider's own loading rules.

```typescript
import { BaseProvider, type ProviderCapabilities } from '@skillpack/core';

class MyProvider extends BaseProvider {
  readonly id = 'my-platform';
  readonly displayName = 'My Platform';
  readonly basePaths = ['/path/to/skills'];
  readonly capabilities: ProviderCapabilities = {
    canToggle: true,
  };

  override async scan() { /* return provider-native Skill instances */ }
  override async setEnabled(skill, enabled) { /* update provider-native availability */ }
  override getDisableStrategy(skill) { /* describe the availability mechanism */ }
}
```

Register it in the manager:

```typescript
manager.registerProvider(new MyProvider());
```

## Project Structure

```
skillpack/
├── packages/
│   ├── core/                  # @skillpack/core — platform-agnostic library
│   │   ├── src/
│   │   │   ├── models/        # Skill, DuplicateInfo, RemoteSkill, etc.
│   │   │   ├── providers/     # Codex, Claude, Global providers + BaseProvider
│   │   │   ├── sources/       # skills.sh install source
│   │   │   ├── config.ts      # Configuration manager
│   │   │   ├── duplicates.ts  # Duplicate detection logic
│   │   │   ├── lockfile.ts    # Lock file manager
│   │   │   ├── manager.ts     # SkillManager — central orchestrator
│   │   │   └── parser.ts      # SKILL.md frontmatter parser (YAML)
│   │   └── tests/
│   └── tui/                   # @skillpack/tui — Ink-based terminal UI
│       └── src/
│           ├── views/         # ListView, DetailView, InstallView, ProjectSkillsView, SettingsView, UpdatesView, UsageView
│           ├── components/    # StatusBar, ConfirmDialog, SearchInput, SkillRow, TabBar
│           ├── context/       # React context for app state
│           ├── hooks/         # useSkillManager, useSkills, useSearch, useTerminalSize
│           └── app.tsx        # App shell and router
├── docs/                      # Design specs and implementation plans
├── package.json               # Workspace root
└── pnpm-workspace.yaml        # pnpm workspace config
```

## License

MIT
