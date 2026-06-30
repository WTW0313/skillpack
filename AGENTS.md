# Skillpack — Agent Guidelines

## Project Overview

Skillpack is a unified TUI manager for agent skills across Codex, Cursor, Claude, and Global (`~/.agents/skills`). It's a pnpm monorepo with two packages:

- `packages/core` (`@skillpack/core`) — platform-agnostic library: skill scanning, providers, install sources, parser, lockfile
- `packages/tui` (`@skillpack/tui`) — Ink (React) terminal UI with keyboard-driven navigation

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues; external PRs are not a triage request surface. See `docs/agents/issue-tracker.md`.

### Triage labels

The default triage label vocabulary is used: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain docs layout. See `docs/agents/domain.md`.

## Tech Stack

- **Language**: TypeScript (ES2022, Node16 modules, strict mode)
- **Package manager**: pnpm with workspaces
- **TUI framework**: Ink 6 + React 19 (terminal UI rendered via Yoga layout)
- **Testing**: Vitest
- **Parser**: YAML frontmatter in SKILL.md files

## Commands

```bash
pnpm install          # install dependencies
pnpm build            # build all packages (tsc)
pnpm test             # run all tests
pnpm dev              # watch mode for TUI

# Run the app
node packages/tui/dist/bin/skillpack.js
```

## Architecture

### Core (`packages/core/src/`)

| File | Purpose |
|------|---------|
| `manager.ts` | `SkillManager` — central orchestrator for scan, toggle, install, uninstall, update |
| `providers/provider.ts` | `ISkillProvider` interface + `BaseProvider` with `.disabled-` prefix toggle |
| `providers/{codex,cursor,claude,global}.ts` | Per-agent provider implementations |
| `duplicates.ts` | `DuplicateDetector` — finds same-name skills across providers (symlink-aware) |
| `models/skill.ts` | `Skill`, `SkillTemplate`, `SkillSource` types (no `readonly` flag — all skills are editable/deletable) |
| `models/duplicate.ts` | `DuplicateInfo`, `DuplicateInstance` types |
| `parser.ts` | SKILL.md YAML frontmatter parser |
| `config.ts` | Configuration manager (`~/.config/skillpack/config.json`) |
| `lockfile.ts` | `LockfileManager` — `~/.config/skillpack/skillpack.lock` for GitHub-installed skills |
| `skills-lock.ts` | `SkillsLockReader` — read-only reader for skills.sh's `~/.agents/.skill-lock.json` |
| `sources/` | Remote install sources (GitHub, skills.sh) |

### TUI (`packages/tui/src/`)

| File | Purpose |
|------|---------|
| `app.tsx` | App shell, router by `view` state |
| `context/app-context.tsx` | Global state: skills, duplicates, selectedSkill, view, refresh |
| `views/list-view.tsx` | Main list with tabs, search, scroll |
| `views/detail-view.tsx` | Skill detail: metadata, source info, update check (`u`), toggle/edit/delete |
| `views/install-view.tsx` | Remote install flow (source → query → results → install to Global) |
| `views/create-view.tsx` | Skill creation wizard |
| `components/` | StatusBar (context-aware shortcuts), ConfirmDialog, SkillRow, TabBar, SearchInput |
| `bin/skillpack.ts` | CLI entry point with alternate screen buffer |

### Routing

The TUI uses a `view` state (`'list' | 'detail' | 'install' | 'create'`) in `app-context.tsx`, not a router library. The `Router` component in `app.tsx` switches on this state.

## Conventions

### Code Style

- ESM-only (`"type": "module"`) — use `.js` extensions in all imports even for TypeScript files
- No redundant comments — don't narrate what code does, only explain non-obvious intent
- Prefer `useMemo` for derived state in React components
- Use `useInput` from Ink for keyboard handling with `isActive` to scope input

### Skill Toggle Mechanism

Skills are toggled by renaming their directory with a `.disabled-` prefix. The `enable`/`disable` methods on providers handle this. When calling toggle from the manager, always use the actual directory name from `skill.path` (via `path.basename()`), never `skill.name`, because the SKILL.md `name` field can differ from the directory name.

### Edit, Delete, and Update

All skills can be edited (`e` opens `$EDITOR`), opened in the system file manager (`o` — uses `open` on macOS, `xdg-open` on Linux), and deleted (`d` with confirmation). There is no `readonly` flag — every skill is fully manageable.

**Delete routing** depends on source type:
- `skillssh`: delegates to `npx skills remove <name> -g -y` (skills CLI manages its own lock)
- `github`: removes the skill directory + removes the entry from `skillpack.lock`
- `local` / other: delegates to the provider's `uninstall` or directly removes the directory

**Update** is available only for `skillssh` and `github` sources. In the detail view, press `u` to first check for updates, then `u` again to apply. Update routing:
- `skillssh`: delegates to `npx skills update <name> -g -y`
- `github`: uninstalls then re-installs via `installFromSource`

Skills with `local` or other source types show no update UI.

### TUI Alternate Screen Buffer

The TUI runs in the terminal's alternate screen buffer (like lazygit, vim). The buffer switch-back must happen **after** Ink's `waitUntilExit()` resolves, not in a `process.on('exit')` handler — otherwise Ink's final render flush leaks onto the main screen.

### Symlink-Aware Scanning

The `skills` CLI (`skills.sh`) installs skill files to `~/.agents/skills/` and creates symlinks in each agent directory (e.g. `~/.claude/skills/foo → ../../.agents/skills/foo`). Providers resolve symlinks via `realpath()` during scan and store the result in `skill.resolvedPath`. The `DuplicateDetector` uses resolved paths to avoid false duplicates — two skills pointing to the same real path are **not** duplicates. The detail view shows symlinks with `→` notation on the path line.

### Two Lock Systems

Skillpack reads from two separate lock systems on startup:

1. **`~/.agents/.skill-lock.json`** (skills.sh, read-only) — maintained by the `skills` CLI. Contains `source`, `sourceUrl`, `skillFolderHash`, `installedAt`, `updatedAt` per skill. Read by `SkillsLockReader` in `skills-lock.ts`. Used to hydrate `source.type = 'skillssh'` for skills whose resolved path lives under `~/.agents/skills/`.

2. **`~/.config/skillpack/skillpack.lock`** (skillpack, read-write) — maintained by `LockfileManager`. Only stores GitHub-installed skills (`source: 'github'`). Contains `repo`, `commit`, `ref`, `identifier`, `installedAt`. Stale entries (skills no longer on disk) and leftover `skillssh` entries are pruned on each scan.

During `scanAll()`, hydration happens in two passes:
- **Pass 1**: Skills under `~/.agents/skills/` are hydrated from `.skill-lock.json` (skillssh source info)
- **Pass 2**: Remaining skills are hydrated from `skillpack.lock` (GitHub source info)

### skills.sh Install Identifiers

The `skills find` output uses `owner/repo@skillName` format (e.g. `onmax/nuxt-skills@pnpm`), but `skills add` expects `owner/repo` with an optional `--skill` flag. The `SkillsShSource` splits the identifier via `parseSkillsShIdentifier()` and constructs the correct command: `npx skills add owner/repo -g -y --skill skillName`.

### Install Flow

Install is global-only (to `~/.agents/skills/`). The install view has 3 steps: source → query → results. On result select, `installFromSource()` is called with `providerId = 'global'`. For skillssh, the skills CLI handles placement; for GitHub, skills are sparse-cloned and copied. GitHub installs record `commit`/`ref`/`repo` to `skillpack.lock` for update tracking.

### Project Skills (Read-Only)

Project-level skills are scanned from `projectSkillsDirs` (configured in `config.ts`, defaults: `.codex/skills`, `.cursor/skills-cursor`, `.claude/skills`, `.agents/skills`) relative to `cwd`. They appear with `scope: 'project'` and `provider: 'project'` in the TUI's "Project" tab. Project skills are read-only in v1 — no install, update, or lockfile management. Same-name project skills take priority over global skills during scan.

### State After Mutations

After any mutation (toggle, edit, delete, update), `refresh()` must be called. The `refresh` function in `app-context.tsx` rescans all providers and also updates `selectedSkill` by matching on `name + provider` so the detail view reflects the new state.

## Testing

- Tests live in `packages/core/tests/`
- Use `vitest` with `describe`/`it`/`expect`
- Provider tests use temp directories (`mkdtemp`) cleaned up in `afterEach`
- TUI has no tests yet

## Common Pitfalls

- **Stale `selectedSkill`**: Always update `selectedSkill` after `refresh()` — it's a separate state from `skills[]`
- **Import extensions**: Must use `.js` in imports (`'./foo.js'`), not `.ts` — Node16 module resolution requires it
- **Async in `useInput`**: Fire-and-forget promises must have `.catch()` to avoid unhandled rejections crashing Ink
- **`.pnpm-store/`**: Never commit — it's in `.gitignore`
- **ClaudeProvider custom scan**: `ClaudeProvider` overrides `scan()` with its own `scanFlat()` / `scanDeep()` — changes to `BaseProvider.scan()` don't apply to Claude skills. Any scan-level feature (symlink resolution, metadata enrichment) must also be added to both Claude scan methods.
