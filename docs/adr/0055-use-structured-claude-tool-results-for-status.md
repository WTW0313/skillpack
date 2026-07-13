# Use structured Claude tool results for status

Claude Skill Usage Import will record valid assistant `Skill` tool_use blocks as `used` by default, and will mark them `failed` only when a matching structured `tool_result` has `is_error === true`. Skillpack will not parse loader logs, stderr text, or natural-language summaries for Claude failure status because those are not stable provider status evidence.
