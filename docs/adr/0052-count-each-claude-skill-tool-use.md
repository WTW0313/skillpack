# Count each Claude Skill tool use

Claude Skill Usage Import will treat each assistant `tool_use` block with `name === "Skill"` as one Skill Invocation. This intentionally differs from Codex's turn-and-skill deduplication because Codex infers usage from file reads that may split one skill load across multiple commands, while Claude exposes a structured invocation event directly.
