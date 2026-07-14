# Scope Claude usage to configured artifact roots

Claude Skill Usage Import will scan configured Claude artifact roots rather than only the project directory matching Skillpack's startup cwd. Skill Usage is provider-wide analytics, so Claude should use the same scope model as Codex and avoid making provider comparisons depend on the directory from which the TUI was launched.

Artifact discovery must reject files outside the configured Usage Artifact Root before evaluating supported path shapes. This containment check includes absolute results from `path.relative`, because Windows cross-volume and cross-share paths can remain absolute instead of beginning with `..`.
