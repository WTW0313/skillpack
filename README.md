# Skillpack

Unified TUI manager for agent skills across Codex, Cursor, Claude, and Global (`~/.agents/skills`).

## Features

- **Multi-platform scanning** — discovers skills from Codex, Cursor, Claude, and Global provider directories automatically, with symlink support
- **Project-level skills** — scans per-project skill directories (`.codex/skills`, `.cursor/skills-cursor`, `.claude/skills`, `.agents/skills`) with override priority over global skills
- **Enable / disable toggle** — disable any skill via `.disabled-` directory prefix rename; re-enable restores it instantly
- **Install from remote sources** — fetch skills from GitHub repos or skills.sh registry
- **Fork to local** — copy any read-only skill into a writable provider for customization
- **Conflict detection** — highlights skills with the same name across different providers
- **Create skills** — scaffold new SKILL.md templates with frontmatter and structure
- **Lock file tracking** — records installed skill provenance in `skillpack.lock`
- **Fuzzy search** — filter skills by name or description
- **Keyboard-driven** — full TUI navigation without a mouse

## Installation

```bash
git clone <repo-url> && cd skillpack
pnpm install
pnpm run build
```

Run directly:

```bash
node packages/tui/dist/bin/skillpack.js
```

Or link globally:

```bash
cd packages/tui && pnpm link --global
skillpack
```

## Quick Start

Launch `skillpack` to see all discovered skills grouped by provider. Use `↑↓` arrow keys to navigate, `Tab` / `Shift+Tab` to switch between provider tabs (All, Codex, Cursor, Claude, Global, Project), and `/` to search.

Press `Space` to toggle a skill on or off, `Enter` to view its details, `i` to install from a remote source, or `c` to create one from scratch.

## Keyboard Shortcuts

### List View

| Key | Action | Description |
|-----|--------|-------------|
| `↑` / `↓` | Navigate | Move selection up / down |
| `Space` | Toggle | Enable or disable the selected skill |
| `Enter` | Detail | Open skill detail view |
| `Tab` / `Shift+Tab` | Switch tab | Cycle through All / Codex / Cursor / Claude / Global / Project |
| `/` | Search | Fuzzy match on name + description |
| `Esc` | Clear search | Clear the active search filter |
| `i` | Install | Install from GitHub or skills.sh |
| `c` | Create | Scaffold a new skill |
| `u` | Update | Check for updates |
| `q` | Quit | Exit skillpack |

### Detail View

| Key | Action | Description |
|-----|--------|-------------|
| `Esc` | Back | Return to list view |
| `Space` | Toggle | Enable or disable the skill |
| `e` / `E` | Edit | Open SKILL.md in `$EDITOR` (writable skills only) |
| `d` | Delete | Uninstall skill with confirmation |
| `↑` / `↓` | Scroll | Scroll the description when it overflows |

## Configuration

Skillpack stores its configuration at `~/.config/skillpack/config.json`. On first run it auto-detects which provider directories exist and enables them.

```json
{
  "editor": "vi",
  "autoCheckUpdates": true,
  "projectSkillsDirs": [
    ".codex/skills",
    ".cursor/skills-cursor",
    ".claude/skills",
    ".agents/skills"
  ],
  "providers": {
    "codex":  { "enabled": true, "paths": ["~/.codex/skills"] },
    "cursor": { "enabled": true, "paths": ["~/.cursor/skills-cursor"] },
    "claude": { "enabled": true, "paths": ["~/.claude/plugins/cache", "~/.claude/skills"] },
    "global": { "enabled": true, "paths": ["~/.agents/skills"] }
  },
  "sources": {
    "github":   { "enabled": true },
    "skillssh": { "enabled": true }
  }
}
```

The lock file lives at `~/.config/skillpack/skillpack.lock` and records the source, identifier, and install timestamp for each remotely installed skill.

## Adding a Provider

Extend the `BaseProvider` class from `@skillpack/core` (which implements `ISkillProvider` with default `scan`, `enable`, `disable` via `.disabled-` prefix rename):

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
│   │   │   ├── models/        # Skill, ConflictInfo, RemoteSkill, etc.
│   │   │   ├── providers/     # Codex, Cursor, Claude, Global providers + BaseProvider
│   │   │   ├── sources/       # GitHub and skills.sh install sources
│   │   │   ├── config.ts      # Configuration manager
│   │   │   ├── conflicts.ts   # Conflict detection logic
│   │   │   ├── lockfile.ts    # Lock file manager
│   │   │   ├── manager.ts     # SkillManager — central orchestrator
│   │   │   └── parser.ts      # SKILL.md frontmatter parser (YAML)
│   │   └── tests/
│   └── tui/                   # @skillpack/tui — Ink-based terminal UI
│       └── src/
│           ├── views/         # ListView, DetailView, InstallView, CreateView, UpdateView
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
