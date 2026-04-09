# Skillpack

Unified TUI manager for agent skills across Codex, Cursor, Claude, and skills.sh.

## Features

- **Multi-platform scanning** — discovers skills from Codex, Cursor, Claude, and skills.sh directories automatically
- **Project-level skills** — scans `.skillpack/skills/` in the current working directory with override priority over global skills
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
npm install
npm run build
```

Run directly:

```bash
node packages/tui/dist/bin/skillpack.js
```

Or link globally:

```bash
npm link --workspace=packages/tui
skillpack
```

## Quick Start

Launch `skillpack` to see all discovered skills grouped by provider. Use arrow keys or `j`/`k` to navigate, `Tab` to switch between provider tabs, and `/` to search.

Press `Enter` on any skill to view its details, `i` to install a new skill from a remote source, or `c` to create one from scratch.

## Keyboard Shortcuts

### List View

| Key | Action | Description |
|-----|--------|-------------|
| `↑` / `k` | Navigate up | Move selection up |
| `↓` / `j` | Navigate down | Move selection down |
| `Tab` | Switch tab | Cycle through All / provider groups |
| `/` | Search | Fuzzy match on name + description |
| `Enter` | Detail | Open skill detail view |
| `i` | Install | Install from GitHub or skills.sh |
| `c` | Create | Scaffold a new skill |
| `u` | Update | Check for updates |
| `q` | Quit | Exit skillpack |

### Detail View

| Key | Action | Description |
|-----|--------|-------------|
| `Esc` | Back | Return to list view |
| `e` / `E` | Edit | Open SKILL.md in `$EDITOR` (writable skills only) |
| `d` | Delete | Uninstall skill with confirmation |
| `f` | Fork | Copy read-only skill to a writable provider |

## Configuration

Skillpack stores its configuration at `~/.config/skillpack/config.json`. On first run it auto-detects which provider directories exist and enables them.

```json
{
  "editor": "vi",
  "autoCheckUpdates": true,
  "projectSkillsDir": ".skillpack/skills",
  "providers": {
    "codex":   { "enabled": true, "paths": ["~/.codex/skills"] },
    "cursor":  { "enabled": true, "paths": ["~/.cursor/skills-cursor"] },
    "claude":  { "enabled": true, "paths": ["~/.claude/plugins/cache"] },
    "skillssh": { "enabled": true, "paths": ["~/.agents/skills"] }
  },
  "sources": {
    "github":  { "enabled": true },
    "skillssh": { "enabled": true }
  }
}
```

The lock file lives at `~/.config/skillpack/skillpack.lock` and records the source, identifier, and install timestamp for each remotely installed skill.

## Adding a Provider

Implement the `ISkillProvider` interface from `@skillpack/core`:

```typescript
import type { ISkillProvider } from '@skillpack/core';

class MyProvider implements ISkillProvider {
  readonly id = 'my-platform';
  readonly displayName = 'My Platform';
  readonly basePaths = ['/path/to/skills'];
  readonly capabilities = {
    canInstall: true,
    canUninstall: true,
    canUpdate: false,
    canToggle: false,
    canCreate: true,
  };

  async scan() { /* return Skill[] */ }
  async install(name, request) { /* ... */ }
  async uninstall(name) { /* ... */ }
  async update(name) { /* ... */ }
  async enable(name) { /* ... */ }
  async disable(name) { /* ... */ }
  async create(template) { /* return Skill */ }
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
│   │   │   ├── providers/     # Codex, Cursor, Claude, SkillsSh providers
│   │   │   ├── sources/       # GitHub and skills.sh install sources
│   │   │   ├── config.ts      # Configuration manager
│   │   │   ├── conflicts.ts   # Conflict detection logic
│   │   │   ├── lockfile.ts    # Lock file manager
│   │   │   ├── manager.ts     # SkillManager — central orchestrator
│   │   │   └── parser.ts      # SKILL.md frontmatter parser
│   │   └── tests/
│   └── tui/                   # @skillpack/tui — Ink-based terminal UI
│       └── src/
│           ├── views/         # ListView, DetailView, InstallView, CreateView, UpdateView
│           ├── components/    # StatusBar, ConfirmDialog, SearchInput, SkillList, TabBar
│           ├── context/       # React context for app state
│           ├── hooks/         # useSkillManager, useKeyboardNav
│           └── app.tsx        # App shell and router
├── docs/                      # Design specs and implementation plans
└── package.json               # Workspace root
```

## License

MIT
