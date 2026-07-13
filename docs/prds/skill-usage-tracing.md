# PRD: Skill Usage Tracing

## Problem Statement

Users can see which skills exist and which Skill Providers can load them, but they cannot see which skills are actually invoked during agent sessions. This makes it hard to understand whether a skill is useful, whether a Skill Provider is actively using skills, or which source paths explain recent agent behavior.

Users need a privacy-conscious Skill Usage view that derives aggregate usage from provider-owned session artifacts without turning Skillpack into a session transcript browser.

## Solution

Add Skill Usage tracing to Skillpack.

Skillpack will read supported provider session artifacts after explicit Usage Import Consent, derive minimal Skill Invocation Records, persist them in a local append-only Skill Usage Log, and show aggregate Skill Usage in a dedicated TUI view. The default output is a 7-day Provider Skill Ranking capped to the top 10 skills, with failed reads shown separately from counted invocations.

Skill Usage is separate from Skill Inventory. Inventory answers what is currently discovered and manageable. Usage answers what was invoked over time, including Project Skills and their Skill Source Paths when provider session evidence identifies them.

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
10. As a Skillpack user, I want heatmap cells to use clear colored activity blocks, so that usage patterns remain quickly scannable.
11. As a Skillpack user, I want the selected heatmap cell detail to show its exact provider, date, and count, so that compact cells remain inspectable without permanent count labels.
12. As a Skillpack user, I want the default usage window to be 7 days, so that the first view reflects recent runtime behavior.
13. As a Skillpack user, I want the Provider Skill Ranking capped to the top 10 skills, so that the output stays focused and scannable.
14. As a Skillpack user, I want Project Skills included when they are invoked, so that repository-owned skills are not omitted from usage analysis.
15. As a Skillpack user, I want usage rows to show the Skill Source Path, so that unscanned Project Skills and moved skills remain understandable without relying on Inventory status.
16. As a Skillpack user, I want same-named skills with different Skill Source Identities separated in usage aggregates, while aliases and versioned cache locations for one logical source remain combined, so that project-local skills are not collapsed and source aliases or plugin upgrades do not create duplicate rows.
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
- The first Claude import scans all supported artifacts and retains every recoverable invocation; subsequent imports use artifact cursors. Display range limits do not discard older derived records.
- The first shippable implementation should prove Codex end to end before adding Claude.
- The Codex adapter reads the real `~/.codex/sessions/**/*.jsonl` and `~/.codex/archived_sessions/*.jsonl` event formats, not a synthetic `skill_invocation` format.
- `~/.codex/logs_2.sqlite` is not a counting source because it includes rendered skill metadata and can confuse available skills with invoked skills.
- Codex skill usage is derived only from `response_item` events with `payload.type === "function_call"` where an `exec_command` directly reads `.../skills/<skill>/SKILL.md`; `session_meta` and `turn_context` provide session, turn, and cwd context for session identity, turn identity, and relative path resolution.
- Codex import excludes system/developer text, AGENTS.md text, available-skill lists, rendered skill metadata, ordinary text mentions, and search/script output such as `rg`, `grep`, or `python` commands that merely mention `SKILL.md`.
- Codex usage is global across configured Codex artifact roots and is not scoped to Skillpack's startup cwd.
- Codex records are deduplicated by `(turn_id, skill_name, Skill Source Identity)`, and Codex Invocation Record IDs use the same identity, so segmented or aliased reads of one logical Skill in one turn count once while same-named skills with distinct source identities remain separate.
- Codex skill names are normalized from the skill path directory, with plugin-owned Codex skills represented as `plugin-name:skill-name`.
- Codex plugin cache paths are aggregated by stable marketplace, plugin, and skill identity while ignoring the cache version directory. This normalized Plugin-Owned Skill identity takes precedence over `resolvedPath`; otherwise distinct real cache targets would recreate one row per version. If one aggregate contains more than one concrete cache path, its displayed Skill Source Path is blank rather than choosing an arbitrary historical version.
- Codex `function_call_output` exit-code evidence maps successful reads to `used` and failed reads to `failed`.
- Claude usage is derived from assistant `tool_use` blocks where `name === "Skill"` in Claude project JSONL transcripts and subagent JSONL transcripts.
- The initial Claude Usage Provider Adapter counts only user-level and plugin-provided skills found through configured Skill Attribution Roots. Project Skills and Built-In Skills are excluded.
- Claude source paths are resolved best-effort from current known Claude skill locations. If an invocation name matches more than one user-level or plugin-provided source, Skillpack counts the invocation with a blank source path rather than assigning it to an arbitrary source. If it matches no eligible source, Skillpack skips it with a Usage Import Diagnostic because the transcript cannot distinguish deleted user content from Built-In or deferred Project Skills.
- Claude invocation names are trimmed and matched exactly against parsed `SKILL.md` names. The adapter does not lowercase names, strip namespaces, or infer identity from directory names.
- Each Claude `Skill` tool_use block counts as one Skill Invocation. Claude records are not deduplicated by turn and skill because the structured tool_use block is already the invocation evidence.
- Claude Invocation Record IDs are derived from provider, real artifact path, session identity, message or line identity, and `tool_use.id`, with stable fallbacks when transcript fields are missing.
- Claude Skill Invocations are recorded as `used` by default. If a matching structured `tool_result` has `is_error === true`, the invocation is recorded as `failed`; stderr text, loader logs, and natural-language summaries are not status evidence.
- If later incremental import evidence changes a Claude invocation's status, Skillpack appends a revision with the same Invocation Record ID. Reads and aggregates use only the latest record for each ID.
- Otherwise-valid Claude `Skill` tool calls with a non-empty invoked name but no valid assistant-record timestamp are skipped with a Usage Import Diagnostic. Malformed calls and empty skill names are not counted as missing-timestamp Skill Invocations. File modification time is not invocation-time evidence; a matching tool result timestamp is used only as optional `endedAt`.
- Repeated skipped Claude invocations are aggregated into one Usage Import Diagnostic per real artifact, skill name, and reason, with the skipped invocation count included.
- Claude artifact discovery follows JSONL file symlinks, resolves them with `realpath`, and parses each real artifact once so shared subagent transcripts are not double-counted.
- Claude artifact discovery accepts only `<encoded-cwd>/<session-uuid>.jsonl` and `<encoded-cwd>/<session-uuid>/subagents/agent-*.jsonl`; other JSONL path shapes are skipped with aggregated diagnostics.
- Claude artifact discovery rejects paths outside the configured Usage Artifact Root before evaluating those shapes. The containment guard rejects empty, parent-traversing, and absolute `path.relative` results so Windows cross-volume or cross-share paths cannot be treated as root members.
- Malformed Claude JSONL lines are skipped without failing the artifact, with one diagnostic per artifact containing the malformed-line count and no raw content. Valid auto-compact summaries are ignored without diagnostics, accepting that compacted structured calls cannot be recovered.
- Claude usage is global across configured Claude artifact roots and is not scoped to Skillpack's startup cwd.
- Claude Usage Import is independent of the Claude Skill Inventory provider's enabled state. Usage Import Consent authorizes artifact reads, while configured Claude Skill Attribution Roots provide eligible user-level and plugin source candidates for attribution. These roots currently reuse the Claude provider's configured paths but have a separate Usage responsibility.
- Current Skill Availability does not filter Claude attribution candidates; disabled user-level skills and disabled plugins remain eligible evidence for historical usage while their source content exists.
- Claude plugin attribution uses configured runtime Skill Attribution Roots such as `~/.claude/plugins/cache`; marketplace checkout directories are not considered unless explicitly configured as a Skill Attribution Root.
- Multiple cached plugin versions are not resolved by semver or file timestamps. Distinct real targets remain source-ambiguous and produce a name-only Counted Invocation; aliases sharing one real target are collapsed normally.
- For a symlinked Claude skill, `skillPath` retains the provider-facing `SKILL.md` path and `resolvedPath` retains its real target. Outside the normalized Plugin-Owned Skill cache exception, Skill Source Identity prefers `resolvedPath` when available and falls back to `skillPath`; presentation considers `skillPath` separately.
- Claude source candidates are collapsed by realpath before attribution. Multiple aliases to one real target retain that `resolvedPath` and leave `skillPath` blank unless exactly one provider-facing path exists; multiple distinct real targets remain source-ambiguous.
- Global Skills and Project Skills are skill scopes in usage identity, not session-producing runtimes.
- Skill Invocation Records persist minimal facts only: provider, normalized provider-facing Skill Source Path evidence, best resolved skill identity evidence, session/turn identity, timestamps, Skill Invocation Status, and deterministic Invocation Record ID. Literal path tokens from provider tool arguments are transient parser input and are not retained separately.
- Prompts, responses, tool arguments, file contents, and full transcripts are never persisted by Skillpack.
- Skill Invocation Status is evidence-based: loaded, used, failed, or unknown.
- Failed invocation records are stored but excluded from default Counted Invocation totals.
- Provider Skill Ranking ranks by exact Counted Invocation count within one Skill Provider and keeps same-named skills with different Skill Source Identities as separate rows, except for versioned cache paths belonging to one stable Plugin-Owned Skill identity.
- Skill Usage Heatmap intensity uses exact Counted Invocation volume across the selected range with one scale across providers.
- Skill Usage does not roll up same-name skills across providers in v1.
- Skill Usage can include Project Skills when a supported Usage Provider Adapter identifies them; Project Skills are deferred for the initial Claude adapter.
- Skill Usage rows show Skill Source Path instead of current/historical status, because Usage should not depend on current scan-root coverage.
- An aggregate displays its provider-facing `skillPath` when all records share one, otherwise its common `resolvedPath` when all records share one, and otherwise a blank Skill Source Path. Skillpack never selects one path arbitrarily from conflicting evidence.
- Usage Coverage State distinguishes supported zero usage from unsupported or not configured providers. Every Provider Skill Usage Overview carries `coverageReasons: UsageCoverageReason[]`; the array is empty for `active`, `zero`, and `unsupported` coverage, while a `not-configured` provider includes every applicable `missing-artifact-roots`, `missing-attribution-roots`, or `provider-not-configured` reason without hiding simultaneous gaps behind a priority order.
- `importAllProviders()` omits providers whose import did not run because required configuration is missing. `SkillUsageImportResult` represents an attempted import; configuration gaps are exposed through Usage Coverage State and Usage Coverage Reasons instead of synthetic import results or Usage Import Diagnostics.
- Usage Provider Adapters parse only stable, known provider artifact formats.
- Unsupported provider evidence is skipped with Usage Import Diagnostics. Ambiguous source attribution may still be counted when the provider evidence proves a real Skill Invocation by name.
- Usage Import Cursors include an importer version so parser fixes can force a one-time rescan of unchanged artifacts.
- Changes to provider invocation identity or deduplication semantics increment the importer version and rebuild that provider's derived records so obsolete record IDs do not remain alongside corrected records.
- The Skill Usage Log is append-only JSONL partitioned by Session-Producing Provider and invocation month; repeated Invocation Record IDs are revisions and only the latest record is current. Every revision of one Invocation Record ID preserves its provider and `startedAt` month. Range queries treat the `YYYY-MM.jsonl` partition name as authoritative and read only months overlapping the requested date range; parser changes that would move records across months require an importer-version rebuild.
- Skill Usage Records are retained until Skill Usage Reset.
- Skill Usage Reset deletes Skillpack's derived Skill Usage Log and Usage Import Cursors only.
- The TUI gets a top-level Skill Usage View reachable with `g`.
- The Skill Usage View uses provider tabs to switch the selected Session-Producing Provider.
- Claude uses the existing Skill Usage View without provider-specific screens or controls; enabling its adapter changes coverage and aggregate data only.
- Unsupported and not-configured provider tabs remain selectable, but they show an explanatory empty state instead of fabricated heatmap or table data. A not-configured empty state uses all of its Usage Coverage Reasons rather than assuming Usage Artifact Roots are always the missing prerequisite.
- Not-configured empty-state copy lists every missing prerequisite in one sentence: missing artifact roots use `<Provider> Usage Artifact Roots are not configured.`, missing attribution roots use `<Provider> Skill Attribution Roots are not configured.`, both use `<Provider> Usage Artifact Roots and Skill Attribution Roots are not configured.`, and `provider-not-configured` alone uses `<Provider> Usage Import is not configured.` Configuration reasons are not repeated as Usage Import Diagnostics.
- The Skill Usage View combines a GitHub-style provider/day heatmap, selected-day usage detail, and an always-present Provider Skill Ranking table.
- The Usage view uses `tab` and `shift+tab` to switch providers, `1`/`2`/`3` to select the 7/30/90 day ranges, up/down arrows to move the selected heatmap day by one day, and left/right arrows to move by one week.
- Heatmap navigation does not wrap at range boundaries.
- When week navigation targets a date that is not present in the heatmap, Skillpack selects the nearest available date in the target week instead of leaving selection unchanged.
- Switching provider or range selects the latest day in the selected range.
- The latest day remains selected by default even when it has zero invocations; Skillpack does not auto-jump to the most recent active day.
- When the Usage view scrolls, page up/page down move the viewport and home/end jump to the top or bottom.
- The Usage view does not introduce a focus mode in v1; keyboard navigation always controls provider/range/day selection unless using page-scroll keys.
- Provider tabs appear at the top of the Usage view, followed by a range segmented control for 7d, 30d, and 90d.
- Usage view keyboard shortcuts are surfaced in the StatusBar rather than repeated inside the main content.
- The bottom Provider Skill Ranking table is not row-selectable and does not support alternate sorting in v1.
- The bottom Provider Skill Ranking table sorts by Counted Invocation count descending, failed invocation count descending, last-used timestamp descending, then skill name ascending.
- The bottom Provider Skill Ranking table columns are Skill, Counted, Failed, Last Used, and Source Path.
- The heatmap uses fixed-width colored block cells to show relative Counted Invocation volume across the selected provider and range; exact counts are shown in Selected-Day Usage Detail instead of permanent cell labels.
- Heatmap color intensity is normalized within the selected provider and selected range, using that view's maximum single-day Counted Invocation count.
- Failed invocations do not contribute to heatmap color intensity; they are shown in Selected-Day Usage Detail and Provider Skill Ranking context.
- The heatmap shows month labels and does not show weekday labels.
- The heatmap uses a GitHub-style calendar layout with weeks as columns and days aligned by weekday rows.
- The heatmap uses a high-contrast colored palette for activity levels; zero-count cells should be visually quiet but not rendered as a grayscale intensity ramp.
- The selected heatmap cell shows exact date, provider, Counted Invocation count, failed invocation count, and per-skill aggregate usage for that day.
- Selected-Day Usage Detail is grouped by stable skill source identity and does not expose session-level or turn-level raw invocation history.
- Selected-Day Usage Detail appears to the right of the heatmap on wide terminals and below the heatmap on narrower terminals.
- Selected-Day Usage Detail columns are Skill, Counted, Failed, and Source Path.
- Selected-Day Usage Detail should show all skills used on the selected day whenever possible.
- When Selected-Day Usage Detail or the bottom Provider Skill Ranking table cannot fit in the terminal, the Usage view becomes scrollable instead of truncating those aggregates.
- The bottom Provider Skill Ranking table is scoped to the selected provider and selected range; Skill Usage does not show a cross-provider total table in v1.
- The bottom Provider Skill Ranking table remains capped to the top 10 skills even when the Usage view is scrollable.
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
- Aggregate tests should use independent literal records to verify Counted Invocation totals, failed exclusion, distinct source-identity separation, resolved-target alias folding, plugin cache version folding, and provider-specific rankings.
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
- Claude Project Skill attribution in the initial Claude adapter.
- SQLite or another database dependency.
- Inferring task success from session outcomes.
- Mutating provider-owned session artifacts.
- Deleting provider-owned session history.
- Treating Usage Import Diagnostics as Inventory Issues.
- Adding support for providers beyond Codex and Claude.

## Further Notes

This PRD builds on the provider-native direction: Skillpack remains a management and analysis console, not the canonical owner of provider runtime state.

Relevant ADRs: ADR-0039 through ADR-0060.
