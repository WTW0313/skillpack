# Split TUI UI Tests from CLI I/O Tests

Skillpack will test terminal UI behavior separately from the command process contract. Terminal UI Tests render an injectable application surface with Ink Testing Library and mocked Skillpack state so view routing, keyboard interaction, search, help, and terminal envelope behavior can be verified without scanning user directories; CLI I/O Tests exercise an injectable CLI runner that owns stdin, stdout, signals, alternate screen buffer control, and process exit, with only a thin process-level smoke test for the built binary.

Snapshots are limited to stable golden frames such as the inventory, detail, help, and too-small terminal states after ANSI output and dynamic values are normalized. Interaction tests use semantic assertions instead of broad snapshots.

The first Terminal UI Test suite will use shared inventory fixture builders and cover user-path behavior before mutation success paths: navigation, detail routing, search, help, terminal envelope states, and the entry or confirmation state for toggle, update, remove, and install flows. Real provider mutations and external commands remain outside Ink UI tests.

Terminal UI Tests will share a harness that fixes terminal size, normalizes output, controls glyph mode, supplies Skillpack inventory fixtures, and provides a mock SkillManager with only the methods exercised by the views. Individual tests should not each invent stream setup, environment setup, or manager mocks.

The first UI and CLI I/O suites prioritize deterministic serial execution over parallel speed. They must unmount Ink renders explicitly and avoid sharing mutable stream, environment, or process-exit state across tests.

Tests isolate side effects by layer. Terminal UI Tests do not open system file managers, run external skill commands, or send real process signals; those paths use mocks or are deferred. CLI I/O Tests exercise terminal control, unmount, wait, and exit behavior through an injectable runner, with real signals limited to a spawned child process smoke test.

This keeps user-facing Ink behavior testable without coupling it to provider scanning, while still protecting the terminal lifecycle guarantees that are easy to break around alternate screen buffer teardown.
