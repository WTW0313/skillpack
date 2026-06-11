# Skillpack

Unified TUI manager for agent skills across Codex, Cursor, Claude, and Global (`~/.agents/skills`).

## Installation

Install globally:

```bash
npm i -g skillpack-tui
skillpack
```

Or run without installing:

```bash
npx skillpack-tui
```

## Features

- Multi-platform scanning for Codex, Cursor, Claude, Global, and project-level skills
- Symlink-aware duplicate detection
- Enable and disable skills with the `.disabled-` directory prefix
- Install skills from GitHub repos or the skills.sh registry
- Create new skills from a TUI wizard
- Edit skill files in `$EDITOR`
- Delete skills with confirmation
- Check and apply updates for supported remote sources
- Fuzzy search by name and description

## Quick Start

Launch `skillpack` to see discovered skills grouped by provider. Use the arrow keys to navigate, `Tab` / `Shift+Tab` to switch provider tabs, and `/` to search.

Press `Space` to toggle a skill on or off, `Enter` to view details, `i` to install from a remote source, or `c` to create a new skill.

## Keyboard Shortcuts

### List View

| Key | Action |
| --- | --- |
| `↑` / `↓` | Navigate skills |
| `Space` | Enable or disable selected skill |
| `Enter` | Open skill detail view |
| `Tab` / `Shift+Tab` | Switch provider tab |
| `/` | Search |
| `Esc` | Clear search |
| `i` | Install from remote |
| `c` | Create skill |
| `u` | Check for updates |
| `q` | Quit |

### Detail View

| Key | Action |
| --- | --- |
| `Esc` | Return to list view |
| `Space` | Enable or disable skill |
| `e` / `E` | Edit `SKILL.md` in `$EDITOR` |
| `o` / `O` | Open skill folder |
| `d` | Delete skill |
| `↑` / `↓` | Scroll description |

## Configuration

Skillpack stores configuration in:

```text
~/.config/skillpack/config.json
```

It auto-detects provider directories on first run and can scan project-level skill directories such as:

```text
.codex/skills
.cursor/skills-cursor
.claude/skills
.agents/skills
```

Remote install provenance is stored in:

```text
~/.config/skillpack/skillpack.lock
```

## Requirements

- Node.js >= 18

## Links

- [GitHub](https://github.com/WTW0313/skillpack)
- [npm](https://www.npmjs.com/package/skillpack-tui)
