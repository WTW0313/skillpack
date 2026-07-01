# Skillpack — Agent Guidelines

## Project Overview

Skillpack is a unified TUI manager for agent skills across Codex, Claude, and Global (`~/.agents/skills`). It's a pnpm monorepo with two packages:

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
| `providers/provider.ts` | `ISkillProvider` interface + `BaseProvider` with fallback `.disabled-` prefix toggle |
| `providers/{codex,claude,global}.ts` | Default provider implementations |
| `duplicates.ts` | `DuplicateDetector` — finds same-name skills across providers (symlink-aware) |
| `models/skill.ts` | `Skill`, `SkillTemplate`, `SkillSource` types |
| `models/duplicate.ts` | `DuplicateInfo`, `DuplicateInstance` types |
| `parser.ts` | SKILL.md YAML frontmatter parser |
| `config.ts` | Configuration manager (`~/.config/skillpack/config.json`) |
| `skills-lock.ts` | `SkillsLockReader` — read-only reader for skills.sh's `~/.agents/.skill-lock.json` |
| `sources/` | Remote install sources (skills.sh only in v1) |

### TUI (`packages/tui/src/`)

| File | Purpose |
|------|---------|
| `app.tsx` | App shell, router by `view` state |
| `context/app-context.tsx` | Global state: skills, duplicates, selectedSkill, view, refresh |
| `views/list-view.tsx` | Main inventory with tabs, search, scroll |
| `views/detail-view.tsx` | Skill detail: metadata, source info, toggle, skills.sh update/remove |
| `views/project-skills-view.tsx` | Read-only Project Skills view |
| `views/settings-view.tsx` | Read-only Settings view for Scan Roots, providers, and sources |
| `views/install-view.tsx` | skills.sh install flow (query → results → install to Global) |
| `views/updates-view.tsx` | Manual skills.sh update checks |
| `components/` | StatusBar (context-aware shortcuts), ConfirmDialog, SkillRow, TabBar, SearchInput |
| `bin/skillpack.ts` | CLI entry point with alternate screen buffer |

### Routing

The TUI uses a `view` state (`'list' | 'detail' | 'install' | 'project' | 'settings' | 'updates'`) in `app-context.tsx`, not a router library. The `Router` component in `app.tsx` switches on this state.

## Conventions

### Code Style

- ESM-only (`"type": "module"`) — use `.js` extensions in all imports even for TypeScript files
- No redundant comments — don't narrate what code does, only explain non-obvious intent
- Prefer `useMemo` for derived state in React components
- Use `useInput` from Ink for keyboard handling with `isActive` to scope input

### Skill Availability And Toggle

Skill discovery and Skill Availability are separate facts. A skill can exist on disk while a provider config marks it unavailable. Providers should read their provider-native config files to decide `skill.enabled` and should toggle by editing provider config when a known config mechanism exists. Codex provider-local skills use `[[skills.config]]` entries in `~/.codex/config.toml` keyed by absolute `SKILL.md` path. Codex Plugin-Owned Skills use `[plugins."plugin-name@marketplace-name"]` in `~/.codex/config.toml`; their availability is `plugin enabled AND skill config not false`, and toggling one toggles the owning plugin for all sibling skills. Claude regular skills use `skillOverrides` in Claude `settings.json`, and Claude plugin skills use `enabledPlugins` for the owning plugin. Use `.disabled-` directory renaming only as a fallback when a scanned provider-owned location has no known config or native disable mechanism. Never use `.disabled-` renaming to toggle Global Skills, because Global Skill directories are Shared Skill Content that Codex or Claude may reference through symlinks. When a fallback rename is used, target the actual directory from `skill.path`, never `skill.name`, because the `SKILL.md` `name` field can differ from the directory name.

### Delete And Update

Skills can be opened in the system file manager (`o` — uses `open` on macOS, `xdg-open` on Linux). Skillpack v1 does not edit or create skills.

Delete is available only for skills.sh-managed Global Skills and delegates to `npx skills remove <name> -g -y` so the skills CLI manages its own lock state.

**Update** is available only for `skillssh` sources. In the detail view, press `u` to first check for updates, then `u` again to apply. The Updates view performs manual bulk checks. Update routing:
- `skillssh`: delegates to `npx skills update <name> -g -y`

Skills with `source.type === 'local'` are unmanaged on-disk skills: Skillpack found them in a provider/project directory but did not match them to skills.sh metadata. They are not necessarily created by Skillpack. They show no update or remove UI.

### TUI Alternate Screen Buffer

The TUI runs in the terminal's alternate screen buffer (like lazygit, vim). The buffer switch-back must happen **after** Ink's `waitUntilExit()` resolves, not in a `process.on('exit')` handler — otherwise Ink's final render flush leaks onto the main screen.

### Symlink-Aware Scanning

The `skills` CLI (`skills.sh`) installs skill files to `~/.agents/skills/` and creates symlinks in each agent directory (e.g. `~/.claude/skills/foo → ../../.agents/skills/foo`). Providers resolve symlinks via `realpath()` during scan and store the result in `skill.resolvedPath`. The `DuplicateDetector` uses resolved paths to avoid false duplicates — two skills pointing to the same real path are **not** duplicates. The detail view shows symlinks with `→` notation on the path line.

### skills.sh Lock Metadata

Skillpack reads **`~/.agents/.skill-lock.json`** (skills.sh, read-only) on startup. The file is maintained by the `skills` CLI and contains `source`, `sourceUrl`, `skillFolderHash`, `installedAt`, and `updatedAt` per skill. `SkillsLockReader` in `skills-lock.ts` hydrates `source.type = 'skillssh'` for skills whose resolved path lives under `~/.agents/skills/`.

All other discovered skills use `source.type = 'local'`, meaning unmanaged on-disk provenance.

### skills.sh Install Identifiers

The `skills find` output uses `owner/repo@skillName` format (e.g. `onmax/nuxt-skills@pnpm`), but `skills add` expects `owner/repo` with an optional `--skill` flag. The `SkillsShSource` splits the identifier via `parseSkillsShIdentifier()` and constructs the correct command: `npx skills add owner/repo -g -y --skill skillName`.

### Install Flow

Install is global-only (to `~/.agents/skills/`). The install view has 3 steps: source → query → results. On result select, `installFromSource()` is called with `providerId = 'global'`. The skills CLI handles placement. GitHub installs are not supported in v1.

### Project Skills (Read-Only)

Project-level skills are scanned from `projectSkillsDirs` (configured in `config.ts`, defaults: `.codex/skills`, `.claude/skills`, `.agents/skills`) relative to `cwd`. They appear with `scope: 'project'` and `provider: 'project'` in the TUI's "Project" tab. Project skills are read-only in v1 — no install, update, toggle, or lockfile management.

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
- **ClaudeProvider custom scan**: `ClaudeProvider` overrides `scan()` with its own `scanFlat()` / `scanDeep()` — changes to `BaseProvider.scan()` don't apply to Claude skills. Any scan-level feature (symlink resolution, metadata enrichment, provider-native availability) must also be added to both Claude scan methods.
