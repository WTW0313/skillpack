# Centralize responsive TUI layout rules

Skillpack will centralize shared responsive TUI rules in small layout primitives and hooks while letting each view decide its essential content. The current views repeat terminal row calculations and fixed column widths, so common handling for Terminal Envelope bands, truncation, reserved chrome, and shortcut overflow should keep responsive behavior consistent without making every view identical.
