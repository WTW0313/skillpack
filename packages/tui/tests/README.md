# TUI Testing

Skillpack keeps terminal UI behavior separate from the command process contract.

## Test Types

`*.test.ts` files at the current test root cover pure functions such as layout, shortcut selection, and formatting.

`ui/*.test.tsx` files are Terminal UI Tests. They render an injectable app surface with Ink Testing Library, shared inventory fixtures, a fixed terminal size, normalized output, and a mock SkillManager. They should verify user-visible behavior through keyboard input and rendered frames without scanning user directories.

`cli/*.test.ts` files are CLI I/O Tests. They exercise the injectable CLI runner that owns stdin, stdout, terminal control sequences, signal handlers, render lifecycle, and process exit. They should not depend on provider scan results or detailed view content.

## Snapshots

Use snapshots only for stable golden frames such as inventory, detail, help, and too-small terminal states. Normalize output before snapshotting, and keep dynamic values such as timestamps, absolute paths, and spinner frames out of snapshots.

Prefer semantic assertions for interactions: assert that search mode opens, a filtered row appears, detail content is shown, or a confirmation prompt is visible.

## Side Effects

Terminal UI Tests must not open the system file manager, run external `skills` commands, mutate provider config, access user skill directories, or send real signals to the Vitest process.

Mock side effects at the layer where they are introduced. Real process signals are only appropriate in a spawned child process smoke test.
