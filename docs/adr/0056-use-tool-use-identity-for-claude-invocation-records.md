# Use tool use identity for Claude invocation records

Claude Skill Usage Import will derive Invocation Record IDs from the provider, real artifact path, session identity, message or line identity, and `tool_use.id`, with stable fallbacks when transcript fields are missing. This keeps repeated imports idempotent while preserving the rule that each structured Claude `Skill` tool_use counts as its own Skill Invocation.
