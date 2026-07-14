# Count name-only Claude Skill Invocations

Claude Skill Usage Import will count a `Skill` tool call when the invoked name matches user-level or plugin-provided skill content, even if that name maps to multiple possible source paths. In that ambiguous-source case, Skillpack persists the invocation with no Skill Source Path rather than choosing a precedence order, because the provider transcript proves the invocation happened but does not prove which same-named source supplied it.

Invocation names are trimmed and matched exactly against parsed `SKILL.md` names. Skillpack will not lowercase names, strip namespaces, or use directory-name guesses because those transformations can merge distinct skills.
