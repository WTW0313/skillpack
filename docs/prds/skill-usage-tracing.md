# PRD: Skill Usage Tracing

## Problem Statement

Users can see which skills exist and which Skill Providers can load them, but they cannot see which skills are actually invoked during agent sessions. This makes it hard to understand whether a skill is useful, whether a Skill Provider is actively using skills, or whether stale and historical skills still explain recent agent behavior.

Users need a privacy-conscious Skill Usage view that derives aggregate usage from provider-owned session artifacts without turning Skillpack into a session transcript browser.

## Solution

Add Skill Usage tracing to Skillpack.

Skillpack will read supported provider session artifacts after explicit Usage Import Consent, derive minimal Skill Invocation Records, persist them in a local append-only Skill Usage Log, and show aggregate Skill Usage in a dedicated TUI view. The default output is a 7-day Provider Skill Ranking capped to the top 10 skills, with failed reads shown separately from counted invocations.

Skill Usage is separate from Skill Inventory. Inventory answers what is currently discovered and manageable. Usage answers what was invoked over time, including Project Skills and Historical Skills when provider session evidence identifies them.

## User Stories

1. As a Skillpack user, I want to see which Skill Providers invoked skills recently, so that I can understand where skills are actually being used.
2. As a Skillpack user, I want to see the top invoked skills for each Session-Producing Provider, so that I can identify the skills that matter most in practice.
3. As a Skillpack user, I want Skill Usage to be derived from agent sessions, so that the numbers reflect runtime behavior rather than installed inventory.
4. As a Skillpack user, I want Usage Import Consent before Skillpack reads session artifacts, so that private provider history is not inspected unexpectedly.
5. As a Skillpack user, I want consent to be remembered, so that bounded incremental imports can keep usage data current after I opt in.
6. As a Skillpack user, I want to reset Skill Usage data, so that I can delete Skillpack's derived telemetry without modifying provider-owned session artifacts.
7. As a Skillpack user, I want Skillpack to persist only minimal invocation facts, so that prompts, responses, tool arguments, file contents, and transcripts are not copied.
8. As a Skillpack user, I want failed invocations recorded but excluded from default rankings, so that broken skills do not look popular.
9. As a Skillpack user, I want failure counts shown as separate context, so that I can notice repeated failed usage without confusing it with normal activity.
10. As a Skillpack user, I want heatmap cells to show exact counts or capped labels, so that usage remains understandable without color.
11. As a Skillpack user, I want the selected heatmap cell to show its exact provider, date, and count, so that compact cells are still inspectable.
12. As a Skillpack user, I want the default usage window to be 7 days, so that the first view reflects recent runtime behavior.
13. As a Skillpack user, I want the Provider Skill Ranking capped to the top 10 skills, so that the output stays focused and scannable.
14. As a Skillpack user, I want Project Skills included when they are invoked, so that repository-owned skills are not omitted from usage analysis.
15. As a Skillpack user, I want Historical Skills kept in usage aggregates, so that deleted or moved skills do not disappear from historical totals.
16. As a Skillpack user, I want Historical Skills clearly labeled, so that I do not confuse them with current controllable Provider Instances.
17. As a Skillpack user, I want unsupported providers shown differently from zero-usage providers, so that missing coverage is not mistaken for inactivity.
18. As a Skillpack user, I want Usage Import Diagnostics when artifacts are skipped, so that I can understand why usage may be incomplete.
19. As a Skillpack user, I want Skillpack to skip ambiguous provider evidence, so that false invocation records are not created.
20. As a Skillpack user, I want Codex Usage Artifact Roots auto-detected, so that common Codex installations work without setup.
21. As a Skillpack user with custom provider locations, I want Usage Artifact Roots to be configurable, so that Skillpack can read my actual session locations.
22. As a Skillpack user, I want a top-level Usage view reachable by a direct shortcut, so that usage is a first-class workflow without crowding Inventory.
23. As a Skillpack user, I want no raw session browser in v1, so that Skillpack remains focused on aggregates and privacy.
24. As a maintainer, I want Skill Invocation Records to have deterministic Invocation Record IDs, so that repeated imports and deep rescans are idempotent.
25. As a maintainer, I want usage data partitioned by Session-Producing Provider and month, so that range queries stay bounded without a database dependency.
26. As a maintainer, I want Skill Invocation Status to be evidence-based, so that Skillpack does not overstate task success.
27. As a maintainer, I want provider-specific Usage Provider Adapters, so that each supported session artifact format is parsed conservatively.
28. As a maintainer, I want known unsupported formats to produce Usage Import Diagnostics, so that import gaps are visible without becoming Inventory Issues.
29. As a maintainer, I want Provider Skill Ranking to avoid cross-provider rollups, so that name-only relationships do not create misleading aggregate totals.
30. As a maintainer, I want the first implementation to prove Codex end to end before adding Claude, so that storage and UI contracts are validated on one concrete provider first.

## Implementation Decisions

- Skill Usage is derived read-only from provider-owned session artifacts.
- Runtime hooks and instrumentation are out of scope.
- Usage Import requires explicit Usage Import Consent before the first read of provider session artifacts.
- After consent, Skillpack may run bounded incremental Skill Usage Import on startup using Usage Import Cursors.
- The first shippable implementation should prove Codex end to end before adding Claude.
- The Codex adapter reads the real `~/.codex/sessions/**/*.jsonl` and `~/.codex/archived_sessions/*.jsonl` event formats, not a synthetic `skill_invocation` format.
- `~/.codex/logs_2.sqlite` is not a counting source because it includes rendered skill metadata and can confuse available skills with invoked skills.
- Codex skill usage is derived only from `response_item` events with `payload.type === "function_call"` where an `exec_command` directly reads `.../skills/<skill>/SKILL.md`; `session_meta` and `turn_context` provide session, turn, and cwd context for session identity, turn identity, and relative path resolution.
- Codex import excludes system/developer text, AGENTS.md text, available-skill lists, rendered skill metadata, ordinary text mentions, and search/script output such as `rg`, `grep`, or `python` commands that merely mention `SKILL.md`.
- Codex usage is global across configured Codex artifact roots and is not scoped to Skillpack's startup cwd.
- Codex records are deduplicated by `(turn_id, skill_name)` so segmented reads of the same `SKILL.md` in one turn count as one invocation.
- Codex skill names are normalized from the skill path directory, with plugin-owned Codex skills represented as `plugin-name:skill-name`.
- Codex `function_call_output` exit-code evidence maps successful reads to `used` and failed reads to `failed`.
- Claude Usage Import is intentionally unsupported in the first Codex-first slice and appears as unsupported coverage until a real Claude session adapter is added.
- Global Skills and Project Skills are skill scopes in usage identity, not session-producing runtimes.
- Skill Invocation Records persist minimal facts only: provider, raw skill evidence, best resolved skill identity evidence, session/turn identity, timestamps, Skill Invocation Status, and deterministic Invocation Record ID.
- Prompts, responses, tool arguments, file contents, and full transcripts are never persisted by Skillpack.
- Skill Invocation Status is evidence-based: loaded, used, failed, or unknown.
- Failed invocation records are stored but excluded from default Counted Invocation totals.
- Provider Skill Ranking ranks by exact Counted Invocation count within one Skill Provider.
- Skill Usage Heatmap intensity uses exact Counted Invocation volume across the selected range with one scale across providers.
- Skill Usage does not roll up same-name skills across providers in v1.
- Skill Usage includes Project Skills when session evidence identifies them.
- Skill Usage keeps Historical Skills in aggregates and labels them distinctly.
- Usage Coverage State distinguishes supported zero usage from unsupported or not configured providers.
- Usage Provider Adapters parse only stable, known provider artifact formats.
- Ambiguous or unsupported provider evidence is skipped with Usage Import Diagnostics.
- Usage Import Cursors include an importer version so parser fixes can force a one-time rescan of unchanged artifacts.
- The Skill Usage Log is append-only JSONL partitioned by Session-Producing Provider and month.
- Skill Usage Records are retained until Skill Usage Reset.
- Skill Usage Reset deletes Skillpack's derived Skill Usage Log and Usage Import Cursors only.
- The TUI gets a top-level Skill Usage View reachable with `g`.
- The Skill Usage View combines a provider-by-day heatmap with Provider Skill Ranking for the selected provider and range.
- The heatmap uses fixed-width cells with readable count labels plus optional color or glyph intensity.
- The selected heatmap cell shows exact date, provider, and count.
- The default time range is 7 days.
- Raw invocation history and export are out of scope for v1.

The decision-rich record shape is:

```ts
interface SkillInvocationRecord {
  schemaVersion: 1;
  recordId: string;
  provider: string;
  sessionId: string;
  turnId?: string;
  skillName: string;
  skillPath?: string;
  resolvedPath?: string;
  source?: { type: 'skillssh' | 'local'; repo?: string; skillFolderHash?: string };
  identityConfidence: 'confirmed' | 'inferred';
  status: 'loaded' | 'used' | 'failed' | 'unknown';
  startedAt: string;
  endedAt?: string | null;
}
```

## Testing Decisions

- The highest-value seam is a core Skill Usage module that imports provider evidence, persists Skill Invocation Records, and returns aggregate Skill Usage for a requested range.
- Tests should exercise public interfaces through real temporary files rather than mocking internal storage functions.
- Provider session artifacts are local-substitutable dependencies: tests should use fixture directories and files that represent supported provider formats.
- Usage Provider Adapter tests should verify observable import results and diagnostics, not internal parser steps.
- JSONL store tests should verify idempotent repeated imports, provider/month partitioning, retention until reset, and range-bounded reads.
- Aggregate tests should use independent literal records to verify Counted Invocation totals, failed exclusion, Historical Skill inclusion, and provider-specific rankings.
- TUI tests can be added where the existing Ink test harness supports them; otherwise the first TUI slice should keep rendering logic factored so core aggregate behavior carries most coverage.
- Do not mock Skillpack's own modules from each other in core tests.
- Do not assert call counts between internal collaborators.
- Do not compute expected rankings or heatmap values using the same algorithm under test.

## Out of Scope

- Runtime instrumentation or hooks in Codex, Claude, or any other agent platform.
- Persisting prompts, responses, tool arguments, file contents, or transcripts.
- Raw invocation history browsing.
- Exporting usage aggregates.
- Cross-provider skill rollups.
- Claude Skill Usage Import before a real Claude session artifact adapter exists.
- SQLite or another database dependency.
- Inferring task success from session outcomes.
- Mutating provider-owned session artifacts.
- Deleting provider-owned session history.
- Treating Usage Import Diagnostics as Inventory Issues.
- Adding support for providers beyond Codex in the first implementation wave.

## Further Notes

This PRD builds on the provider-native direction: Skillpack remains a management and analysis console, not the canonical owner of provider runtime state.

Relevant ADRs: ADR-0039 through ADR-0048.
