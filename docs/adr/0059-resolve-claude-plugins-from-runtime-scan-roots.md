# Use runtime provider paths as Claude Skill Attribution Roots

Claude Skill Usage Import will resolve plugin-provided skill candidates from configured runtime Skill Attribution Roots, such as `~/.claude/plugins/cache`, and will not inspect marketplace checkout directories unless the user explicitly configures them as a Skill Attribution Root. The initial configuration reuses Claude provider paths, but the Usage role is attribution rather than Inventory scanning. This avoids attributing invocations to catalog copies or duplicate plugin versions that Claude may not load at runtime.

When several cached versions expose the same skill name, Skillpack will not infer the invoked version from semver or file timestamps. Different resolved targets remain source-ambiguous, while aliases to one resolved target are collapsed.
