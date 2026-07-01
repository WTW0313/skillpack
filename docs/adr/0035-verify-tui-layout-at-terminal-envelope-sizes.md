# Verify TUI layout at Terminal Envelope sizes

Responsive TUI changes will be verified at the Terminal Envelope sizes: 80x24, 60x18, and below-minimum dimensions. Tests should focus on shared layout helpers and representative view states for visible core state, bounded scrolling, stable reserved regions, and no obvious overflow, with manual terminal smoke checks before release rather than exhaustive snapshots of every row.
