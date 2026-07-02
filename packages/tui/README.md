# Skillpack

Unified TUI manager for agent skills across Codex, Claude, and Global (`~/.agents/skills`).

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

- Multi-platform scanning for Codex, Codex plugins, Claude, Global, and project-level skills
- Symlink-aware duplicate detection
- Enable and disable Codex and Claude skills through provider-native availability mechanisms
- Install Global Skills through the skills.sh registry
- Check and apply manual updates for skills.sh-managed Global Skills
- Fuzzy search by name and description

## Quick Start

Launch `skillpack` to see discovered skills grouped into Skill Groups with provider status and Health Signals. Use the arrow keys to navigate, `Tab` / `Shift+Tab` to filter by provider, and `/` to search.

Press `Enter` to inspect a Skill Group, then use left/right to choose a provider instance before taking instance-level actions. Press `p` to inspect read-only Project Skills, `s` to inspect Settings and Scan Roots, `i` to install a Global Skill, or `u` to open manual updates. Plugin-owned skills ask for confirmation because the toggle affects every skill from the owning plugin.

## Keyboard Shortcuts

### List View

| Key | Action |
| --- | --- |
| `↑` / `↓` | Navigate skills |
| `Enter` | Open Skill Group detail view |
| `Tab` / `Shift+Tab` | Switch provider tab |
| `/` | Search |
| `Esc` | Clear search |
| `p` | Open Project Skills |
| `s` | Open Settings |
| `i` | Install through skills.sh |
| `u` | Open manual updates |
| `q` | Quit |

### Detail View

| Key | Action |
| --- | --- |
| `Esc` | Return to list view |
| `←` / `→` | Switch provider instance |
| `Space` | Enable or disable Codex or Claude skill; plugin-owned skills ask for confirmation |
| `o` / `O` | Open skill folder |
| `d` | Remove a skills.sh-managed Global Skill |
| `↑` / `↓` | Scroll description |

## Configuration

Skillpack stores configuration in:

```text
~/.config/skillpack/config.json
```

It auto-detects provider directories on first run and can scan project-level skill directories such as:

```text
.codex/skills
.claude/skills
.agents/skills
```

## Requirements

- Node.js >= 18

## Links

- [GitHub](https://github.com/WTW0313/skillpack)
- [npm](https://www.npmjs.com/package/skillpack-tui)
