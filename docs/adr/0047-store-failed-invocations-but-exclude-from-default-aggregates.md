# Store failed invocations but exclude from default aggregates

Skillpack will persist failed Skill Invocation Records with `status: "failed"` so usage diagnostics can show failure context. Default Provider Skill Ranking and Skill Usage Heatmap intensity will exclude failed records from Counted Invocation totals, because repeated failures should not make a skill appear more used.
