# Skillpack

Unified TUI manager for agent skills across Codex, Claude, and Global (`~/.agents/skills`).

## Features

- **Multi-platform scanning** — discovers skills from Codex, Claude, and Global provider locations automatically, with symlink support
- **Project Skills** — scans read-only project skill directories (`.codex/skills`, `.claude/skills`, `.agents/skills`) in a separate view
- **Provider-native availability** — reads provider config when available and uses `.disabled-` renaming only as a fallback
- **Skill Inventory** — groups provider instances by Skill Identity and surfaces deterministic Health Signals
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

Launch `skillpack` to see all discovered skills grouped by provider. Use `↑↓` arrow keys to navigate, `Tab` / `Shift+Tab` to switch between provider tabs (All, Codex, Claude, Global), and `/` to search.

Press `Space` to toggle a provider instance on or off, `Enter` to view details, `p` to inspect read-only Project Skills, `i` to install a skills.sh Global Skill, or `u` to open manual updates.

## Keyboard Shortcuts

### List View

| Key | Action | Description |
|-----|--------|-------------|
| `↑` / `↓` | Navigate | Move selection up / down |
| `Space` | Toggle | Enable or disable the selected skill |
| `Enter` | Detail | Open skill detail view |
| `Tab` / `Shift+Tab` | Switch tab | Cycle through All / Codex / Claude / Global |
| `/` | Search | Fuzzy match on name + description |
| `Esc` | Clear search | Clear the active search filter |
| `p` | Project Skills | Open read-only Project Skills view |
| `i` | Install | Install a Global Skill through skills.sh |
| `u` | Updates | Open manual skills.sh updates |
| `q` | Quit | Exit skillpack |

### Detail View

| Key | Action | Description |
|-----|--------|-------------|
| `Esc` | Back | Return to list view |
| `Space` | Toggle | Enable or disable the skill |
| `o` / `O` | Open folder | Open skill directory in system file manager |
| `d` | Delete | Remove a skills.sh-managed Global Skill with confirmation |
| `↑` / `↓` | Scroll | Scroll the description when it overflows |

## Configuration

Skillpack stores its configuration at `~/.config/skillpack/config.json`. On first run it auto-detects which provider directories exist and enables them.

```json
{
  "editor": "vi",
  "autoCheckUpdates": true,
  "projectSkillsDirs": [
    ".codex/skills",
    ".claude/skills",
    ".agents/skills"
  ],
  "providers": {
    "codex":  { "enabled": true, "paths": ["~/.codex/skills"] },
    "claude": { "enabled": true, "paths": ["~/.claude/plugins/cache", "~/.claude/skills"] },
    "global": { "enabled": true, "paths": ["~/.agents/skills"] }
  },
  "sources": {
    "skillssh": { "enabled": true }
  }
}
```

## Adding a Provider

Extend the `BaseProvider` class from `@skillpack/core` (which implements `ISkillProvider` with default scanning and a fallback `.disabled-` prefix rename strategy). Providers with native availability config should override `scan`, `setEnabled`, and `getDisableStrategy` so Skillpack reflects the provider's own loading rules.

```typescript
import { BaseProvider, type ProviderCapabilities } from '@skillpack/core';

class MyProvider extends BaseProvider {
  readonly id = 'my-platform';
  readonly displayName = 'My Platform';
  readonly basePaths = ['/path/to/skills'];
  readonly capabilities: ProviderCapabilities = {
    canInstall: true,
    canUninstall: true,
    canUpdate: false,
    canToggle: true,
    canCreate: true,
  };

  override async uninstall(name: string) { /* ... */ }
  override async create(template) { /* return Skill */ }
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
│           ├── views/         # ListView, DetailView, InstallView, ProjectSkillsView, UpdatesView
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
