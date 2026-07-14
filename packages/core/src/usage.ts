import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deriveCodexUsageEvidence } from './codex-usage-evidence.js';
import { parseSkillMd } from './parser.js';
import { isSupportedClaudeArtifactPath } from './usage-paths.js';

const USAGE_IMPORTER_VERSIONS: Readonly<Record<string, number>> = {
  codex: 9,
  claude: 8,
};

export type UsageCoverageState = 'unsupported' | 'not-configured' | 'zero' | 'active';
export type UsageCoverageReason = 'missing-artifact-roots' | 'missing-attribution-roots' | 'provider-not-configured';
export type SkillInvocationStatus = 'loaded' | 'used' | 'failed' | 'unknown';

export interface SkillUsageProviderConfig {
  provider: string;
  displayName: string;
  supported: boolean;
  configured?: boolean;
  artifactRoots?: string[];
  skillRoots?: string[];
}

export interface SkillUsageOverviewInput {
  rangeDays: 7 | 30 | 90;
  now?: Date;
}

export interface CurrentSkillReference {
  provider: string;
  name: string;
  path?: string;
  resolvedPath?: string;
  source?: SkillInvocationSource;
}

export interface SkillUsageRange {
  days: 7 | 30 | 90;
  from: string;
  to: string;
}

export interface SkillUsageHeatmapCell {
  date: string;
  countedInvocations: number;
  failedInvocations: number;
}

export interface ProviderSkillRankingRow {
  skillName: string;
  sourcePath?: string;
  countedInvocations: number;
  failedInvocations: number;
  lastInvokedAt?: string;
}

export interface ProviderSkillDailyUsage {
  date: string;
  rows: ProviderSkillUsageRow[];
}

export interface ProviderSkillUsageRow {
  skillName: string;
  sourcePath?: string;
  countedInvocations: number;
  failedInvocations: number;
  lastInvokedAt?: string;
}

export interface UsageImportDiagnostic {
  provider: string;
  message: string;
}

export interface SkillInvocationSource {
  type: 'skillssh' | 'local';
  repo?: string;
  skillFolderHash?: string;
}

export interface SkillInvocationRecord {
  schemaVersion: 1;
  recordId: string;
  provider: string;
  sessionId: string;
  turnId?: string;
  skillName: string;
  skillPath?: string;
  resolvedPath?: string;
  source?: SkillInvocationSource;
  identityConfidence: 'confirmed' | 'inferred';
  status: SkillInvocationStatus;
  startedAt: string;
  endedAt?: string | null;
}

export interface SkillUsageImportResult {
  provider: string;
  importedRecords: number;
  skippedArtifacts: number;
  diagnostics: UsageImportDiagnostic[];
}

interface UsageImportCursor {
  provider: string;
  importerVersion?: number;
  stale?: boolean;
  artifacts: Record<
    string,
    {
      size: number;
      mtimeMs: number;
    }
  >;
}

interface ParsedInvocationResult {
  records: SkillInvocationRecord[];
  ambiguousLineNumbers: number[];
  diagnostics?: UsageImportDiagnostic[];
}

interface ClaudeSkillCandidate {
  name: string;
  skillPath: string;
  resolvedPath: string;
}

interface ParsedJsonlRecord {
  lineIndex: number;
  value: Record<string, unknown>;
}

interface ProviderSkillUsageAccumulator {
  row: Omit<ProviderSkillUsageRow, 'sourcePath'>;
  recordCount: number;
  providerPathCount: number;
  providerPaths: Set<string>;
  resolvedPathCount: number;
  resolvedPaths: Set<string>;
}

export interface ProviderSkillUsageOverview {
  provider: string;
  displayName: string;
  coverageState: UsageCoverageState;
  coverageReasons: UsageCoverageReason[];
  heatmap: SkillUsageHeatmapCell[];
  dailySkillUsage: ProviderSkillDailyUsage[];
  ranking: ProviderSkillRankingRow[];
  diagnostics: UsageImportDiagnostic[];
}

export interface SkillUsageOverview {
  range: SkillUsageRange;
  providers: ProviderSkillUsageOverview[];
}

export class SkillUsageManager {
  private providers: SkillUsageProviderConfig[];
  private dataDir: string;
  private now?: Date;
  private latestDiagnostics = new Map<string, UsageImportDiagnostic[]>();

  constructor(options: { providers?: SkillUsageProviderConfig[]; dataDir?: string; now?: Date } = {}) {
    this.providers = options.providers ?? [];
    this.dataDir = options.dataDir ?? path.join(os.homedir(), '.local', 'share', 'skillpack', 'usage');
    this.now = options.now;
  }

  async importProvider(providerId: string, currentSkills?: CurrentSkillReference[]): Promise<SkillUsageImportResult> {
    const provider = this.providers.find((candidate) => candidate.provider === providerId);
    if (!provider) throw new Error(`Usage provider not found: ${providerId}`);

    const diagnostics: UsageImportDiagnostic[] = [];
    let skippedArtifacts = 0;
    const records: SkillInvocationRecord[] = [];
    const claudeSkills =
      provider.provider === 'claude' ? await readClaudeSkillCandidates(provider.skillRoots ?? []) : [];
    const cursor = await this.readCursor(provider.provider);
    if (cursor.stale)
      await rm(path.join(this.dataDir, 'invocations', provider.provider), { recursive: true, force: true });
    const nextCursor: UsageImportCursor = {
      provider: provider.provider,
      artifacts: { ...cursor.artifacts },
    };
    const seenRealArtifacts = new Set<string>();

    for (const root of provider.artifactRoots ?? []) {
      const files = await listJsonlFiles(root).catch((err) => {
        diagnostics.push({ provider: provider.provider, message: err instanceof Error ? err.message : String(err) });
        return [];
      });

      for (const file of files) {
        const metadata = await stat(file).catch((err) => {
          diagnostics.push({ provider: provider.provider, message: err instanceof Error ? err.message : String(err) });
          skippedArtifacts += 1;
          return null;
        });
        if (!metadata) continue;
        const cursorEntry = cursor.artifacts[file];
        if (cursorEntry?.size === metadata.size && cursorEntry.mtimeMs === metadata.mtimeMs) continue;
        if (provider.provider === 'claude' && !isSupportedClaudeArtifactPath(root, file)) {
          skippedArtifacts += 1;
          diagnostics.push({
            provider: provider.provider,
            message: `Skipped unsupported Claude artifact path: ${path.relative(root, file)}`,
          });
          nextCursor.artifacts[file] = { size: metadata.size, mtimeMs: metadata.mtimeMs };
          continue;
        }
        const realArtifactPath = await realpath(file).catch((err) => {
          diagnostics.push({ provider: provider.provider, message: err instanceof Error ? err.message : String(err) });
          skippedArtifacts += 1;
          return null;
        });
        if (!realArtifactPath) continue;
        if (seenRealArtifacts.has(realArtifactPath)) {
          nextCursor.artifacts[file] = { size: metadata.size, mtimeMs: metadata.mtimeMs };
          continue;
        }
        seenRealArtifacts.add(realArtifactPath);

        const content = await readFile(file, 'utf-8').catch((err) => {
          diagnostics.push({ provider: provider.provider, message: err instanceof Error ? err.message : String(err) });
          skippedArtifacts += 1;
          return '';
        });
        if (!content) continue;

        const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
        const result =
          provider.provider === 'claude'
            ? await parseClaudeInvocationLines(provider.provider, file, lines, claudeSkills, currentSkills)
            : await parseCodexInvocationLines(provider.provider, file, lines, currentSkills);
        records.push(...result.records);
        diagnostics.push(...(result.diagnostics ?? []));
        for (const lineNumber of result.ambiguousLineNumbers) {
          skippedArtifacts += 1;
          diagnostics.push({
            provider: provider.provider,
            message: `Skipped ambiguous skill invocation evidence in ${path.basename(file)}:${lineNumber}`,
          });
        }
        nextCursor.artifacts[file] = { size: metadata.size, mtimeMs: metadata.mtimeMs };
      }
    }

    const importedRecords = await this.writeRecords(records);
    await this.writeCursor(provider.provider, nextCursor);
    this.latestDiagnostics.set(provider.provider, diagnostics);

    return {
      provider: provider.provider,
      importedRecords,
      skippedArtifacts,
      diagnostics,
    };
  }

  async importAllProviders(currentSkills?: CurrentSkillReference[]): Promise<SkillUsageImportResult[]> {
    const results: SkillUsageImportResult[] = [];
    for (const provider of this.providers) {
      if (!provider.supported || !provider.artifactRoots?.length) continue;
      if (provider.provider === 'claude' && !provider.skillRoots?.length) continue;
      results.push(await this.importProvider(provider.provider, currentSkills));
    }
    return results;
  }

  async reset(): Promise<void> {
    await rm(path.join(this.dataDir, 'invocations'), { recursive: true, force: true });
    await rm(path.join(this.dataDir, 'cursors'), { recursive: true, force: true });
    this.latestDiagnostics.clear();
  }

  async getOverview(input: SkillUsageOverviewInput): Promise<SkillUsageOverview> {
    const range = buildRange(input.rangeDays, input.now ?? new Date());
    return {
      range,
      providers: await Promise.all(
        this.providers.map(async (provider) => {
          const coverageReasons = coverageReasonsFor(provider);
          if (!provider.supported) {
            return {
              provider: provider.provider,
              displayName: provider.displayName,
              coverageState: coverageStateFor(provider, 0),
              coverageReasons,
              heatmap: [],
              dailySkillUsage: [],
              ranking: [],
              diagnostics: this.latestDiagnostics.get(provider.provider) ?? [],
            };
          }
          const records = await this.readProviderRecords(provider.provider, range);
          const heatmap = buildHeatmap(records, range);
          const dailySkillUsage = buildDailySkillUsage(records, range);
          const ranking = buildRanking(records);
          return {
            provider: provider.provider,
            displayName: provider.displayName,
            coverageState: coverageStateFor(provider, records.length),
            coverageReasons,
            heatmap,
            dailySkillUsage,
            ranking,
            diagnostics: this.latestDiagnostics.get(provider.provider) ?? [],
          };
        }),
      ),
    };
  }

  private async writeRecords(records: SkillInvocationRecord[]): Promise<number> {
    const byPartition = new Map<string, SkillInvocationRecord[]>();
    for (const record of records) {
      const month = record.startedAt.slice(0, 7);
      const partition = path.join(this.dataDir, 'invocations', record.provider, `${month}.jsonl`);
      byPartition.set(partition, [...(byPartition.get(partition) ?? []), record]);
    }

    let written = 0;
    for (const [partition, partitionRecords] of byPartition) {
      await mkdir(path.dirname(partition), { recursive: true });
      const existing = await readFile(partition, 'utf-8').catch(() => '');
      const latest = latestSerializedRecords(existing);
      const newRecords = partitionRecords.filter((record) => {
        const serialized = JSON.stringify(record);
        if (latest.get(record.recordId) === serialized) return false;
        latest.set(record.recordId, serialized);
        return true;
      });
      if (newRecords.length === 0) continue;
      written += newRecords.length;
      const next = newRecords.map((record) => JSON.stringify(record)).join('\n');
      await writeFile(partition, existing + next + '\n', 'utf-8');
    }

    return written;
  }

  private async readProviderRecords(provider: string, range: SkillUsageRange): Promise<SkillInvocationRecord[]> {
    const dir = path.join(this.dataDir, 'invocations', provider);
    const files = [...new Set(datesInRange(range).map((date) => date.slice(0, 7)))].map((month) =>
      path.join(dir, `${month}.jsonl`),
    );
    const latestRecords = new Map<string, SkillInvocationRecord>();

    for (const file of files.sort()) {
      const content = await readFile(file, 'utf-8').catch(() => '');
      for (const line of content.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const record = JSON.parse(line) as SkillInvocationRecord;
          const date = record.startedAt.slice(0, 10);
          if (date >= range.from && date <= range.to) latestRecords.set(record.recordId, record);
        } catch {
          // Ignore malformed derived records; provider import diagnostics cover source artifacts.
        }
      }
    }

    return [...latestRecords.values()];
  }

  private async readCursor(provider: string): Promise<UsageImportCursor> {
    const cursorPath = path.join(this.dataDir, 'cursors', `${provider}.json`);
    const content = await readFile(cursorPath, 'utf-8').catch(() => '');
    if (!content) return { provider, artifacts: {} };
    const importerVersion = usageImporterVersion(provider);
    try {
      const cursor = JSON.parse(content) as UsageImportCursor;
      if (cursor.importerVersion !== importerVersion) return { provider, stale: true, artifacts: {} };
      return {
        provider,
        importerVersion,
        artifacts: cursor.artifacts ?? {},
      };
    } catch {
      return { provider, artifacts: {} };
    }
  }

  private async writeCursor(provider: string, cursor: UsageImportCursor): Promise<void> {
    const cursorPath = path.join(this.dataDir, 'cursors', `${provider}.json`);
    await mkdir(path.dirname(cursorPath), { recursive: true });
    await writeFile(
      cursorPath,
      JSON.stringify(
        {
          ...cursor,
          provider,
          importerVersion: usageImporterVersion(provider),
        },
        null,
        2,
      ) + '\n',
      'utf-8',
    );
  }
}

function usageImporterVersion(provider: string): number {
  return USAGE_IMPORTER_VERSIONS[provider] ?? 8;
}

function coverageStateFor(provider: SkillUsageProviderConfig, recordCount = 0): UsageCoverageState {
  if (!provider.supported) return 'unsupported';
  if (coverageReasonsFor(provider).length > 0) return 'not-configured';
  if (recordCount > 0) return 'active';
  return 'zero';
}

function coverageReasonsFor(provider: SkillUsageProviderConfig): UsageCoverageReason[] {
  if (!provider.supported) return [];
  const reasons: UsageCoverageReason[] = [];
  if (!provider.artifactRoots?.length) reasons.push('missing-artifact-roots');
  if (provider.provider === 'claude' && !provider.skillRoots?.length) reasons.push('missing-attribution-roots');
  if (provider.configured === false) reasons.push('provider-not-configured');
  return reasons;
}

function buildRange(days: 7 | 30 | 90, now: Date): SkillUsageRange {
  const end = toUtcDate(now);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);

  return {
    days,
    from: formatDate(start),
    to: formatDate(end),
  };
}

function toUtcDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function latestSerializedRecords(content: string): Map<string, string> {
  const records = new Map<string, string>();
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line) as { recordId?: unknown };
      if (typeof value.recordId === 'string') records.set(value.recordId, JSON.stringify(value));
    } catch {
      // Ignore malformed derived records when deduplicating new writes.
    }
  }
  return records;
}

async function listJsonlFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch((err) => {
    if (isNodeError(err) && err.code === 'ENOENT') return [];
    throw err;
  });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) return listJsonlFiles(entryPath);
      return (entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith('.jsonl') ? [entryPath] : [];
    }),
  );
  return files.flat();
}

async function parseCodexInvocationLines(
  provider: string,
  sourceFile: string,
  lines: string[],
  currentSkills?: CurrentSkillReference[],
): Promise<ParsedInvocationResult> {
  const ambiguousLineNumbers: number[] = [];
  const evidence = deriveCodexUsageEvidence({ sourceFile, lines });

  const recordsByTurnAndSkill = new Map<string, SkillInvocationRecord>();
  for (const candidate of evidence.reads) {
    const skillIdentity = await readSkillIdentity(candidate.skillPath);
    const skillName = skillIdentity.name;
    if (!skillName || !candidate.sessionId || !candidate.turnId || !candidate.startedAt) {
      ambiguousLineNumbers.push(candidate.lineIndex + 1);
      continue;
    }
    const sourceIdentity = skillSourceIdentity({
      provider,
      skillPath: candidate.skillPath,
      resolvedPath: skillIdentity.resolvedPath,
    });
    const recordKey = `${candidate.turnId}\0${skillName}\0${sourceIdentity}`;
    const existing = recordsByTurnAndSkill.get(recordKey);
    if (existing) {
      existing.status = mergeInvocationStatus(existing.status, candidate.status);
      if (candidate.startedAt < existing.startedAt) existing.startedAt = candidate.startedAt;
      if (candidate.endedAt && (!existing.endedAt || candidate.endedAt > existing.endedAt))
        existing.endedAt = candidate.endedAt;
      if (skillIdentity.confirmed) {
        if (existing.identityConfidence === 'confirmed') {
          existing.skillPath = commonPathEvidence(existing.skillPath, candidate.skillPath);
          existing.resolvedPath = commonPathEvidence(existing.resolvedPath, skillIdentity.resolvedPath);
        } else {
          existing.skillPath = candidate.skillPath;
          existing.resolvedPath = skillIdentity.resolvedPath;
        }
        existing.identityConfidence = 'confirmed';
      }
      existing.source ??= findCurrentSkillSource(
        {
          provider,
          skillName,
          skillPath: candidate.skillPath,
          resolvedPath: skillIdentity.resolvedPath,
        },
        currentSkills,
      );
      continue;
    }

    const source = findCurrentSkillSource(
      {
        provider,
        skillName,
        skillPath: candidate.skillPath,
        resolvedPath: skillIdentity.resolvedPath,
      },
      currentSkills,
    );

    recordsByTurnAndSkill.set(recordKey, {
      schemaVersion: 1,
      recordId: invocationRecordId(provider, candidate.sessionId, candidate.turnId, skillName, sourceIdentity),
      provider,
      sessionId: candidate.sessionId,
      turnId: candidate.turnId,
      skillName,
      skillPath: candidate.skillPath,
      resolvedPath: skillIdentity.resolvedPath,
      source,
      identityConfidence: skillIdentity.confirmed ? 'confirmed' : 'inferred',
      status: candidate.status,
      startedAt: candidate.startedAt,
      endedAt: candidate.endedAt ?? null,
    });
  }

  const diagnostics = evidence.findings.map((finding) => ({
    provider,
    message: `Skipped ${finding.count} potential Codex Skill invocation${finding.count === 1 ? '' : 's'} in ${path.basename(sourceFile)}: ${finding.reason}`,
  }));
  return { records: [...recordsByTurnAndSkill.values()], ambiguousLineNumbers, diagnostics };
}

async function parseClaudeInvocationLines(
  provider: string,
  sourceFile: string,
  lines: string[],
  skillCandidates: ClaudeSkillCandidate[],
  currentSkills?: CurrentSkillReference[],
): Promise<ParsedInvocationResult> {
  const records: SkillInvocationRecord[] = [];
  const unmatchedCounts = new Map<string, number>();
  const realArtifactPath = await realpath(sourceFile).catch(() => sourceFile);
  const toolResults = new Map<string, { failed: boolean; endedAt?: string }>();
  let missingTimestampCount = 0;
  const parsed = parseJsonlRecords(lines);

  for (const { value } of parsed.records) {
    const message = isRecord(value.message) ? value.message : undefined;
    if (!message || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (!isRecord(block) || block.type !== 'tool_result') continue;
      const toolUseId = stringValue(block.tool_use_id);
      if (!toolUseId) continue;
      toolResults.set(toolUseId, {
        failed: block.is_error === true,
        endedAt: stringValue(value.timestamp),
      });
    }
  }

  for (const { lineIndex, value } of parsed.records) {
    if (value.type !== 'assistant') continue;
    const message = isRecord(value.message) ? value.message : undefined;
    if (!message || message.role !== 'assistant' || !Array.isArray(message.content)) continue;
    const startedAt = stringValue(value.timestamp);
    if (!isValidInvocationTimestamp(startedAt)) {
      missingTimestampCount += message.content.filter((block) => claudeSkillName(block) !== undefined).length;
      continue;
    }
    const sessionId =
      stringValue(value.sessionId) ?? stringValue(value.session_id) ?? path.basename(sourceFile, '.jsonl');
    const messageId = stringValue(value.uuid) ?? stringValue(message.id) ?? `${sessionId}:${lineIndex + 1}`;

    for (const [blockIndex, block] of message.content.entries()) {
      const skillName = claudeSkillName(block);
      if (!skillName) continue;
      const matches = skillCandidates.filter((candidate) => candidate.name === skillName);
      if (matches.length === 0) {
        unmatchedCounts.set(skillName, (unmatchedCounts.get(skillName) ?? 0) + 1);
        continue;
      }
      const sourceMatch = resolveClaudeSkillSource(matches);
      const toolUseId = stringValue(block.id) ?? `${messageId}:${blockIndex}`;
      const toolResult = toolResults.get(toolUseId);
      records.push({
        schemaVersion: 1,
        recordId: claudeInvocationRecordId(provider, realArtifactPath, sessionId, messageId, toolUseId),
        provider,
        sessionId,
        turnId: messageId,
        skillName,
        skillPath: sourceMatch.skillPath,
        resolvedPath: sourceMatch.resolvedPath,
        source: sourceMatch.confirmed
          ? findCurrentSkillSource({ provider, skillName, ...sourceMatch }, currentSkills)
          : undefined,
        identityConfidence: sourceMatch.confirmed ? 'confirmed' : 'inferred',
        status: toolResult?.failed ? 'failed' : 'used',
        startedAt,
        endedAt: toolResult?.endedAt ?? null,
      });
    }
  }

  const diagnostics: UsageImportDiagnostic[] = [];
  if (parsed.malformedLineCount > 0) {
    diagnostics.push({
      provider,
      message: `Skipped ${parsed.malformedLineCount} malformed JSONL line${parsed.malformedLineCount === 1 ? '' : 's'} in ${path.basename(sourceFile)}`,
    });
  }
  if (missingTimestampCount > 0) {
    diagnostics.push({
      provider,
      message: `Skipped ${missingTimestampCount} Claude Skill invocation${missingTimestampCount === 1 ? '' : 's'} in ${path.basename(sourceFile)}: missing or invalid assistant timestamp`,
    });
  }
  diagnostics.push(
    ...[...unmatchedCounts.entries()].map(([skillName, count]) => ({
      provider,
      message: `Skipped ${count} Claude Skill invocation${count === 1 ? '' : 's'} for "${skillName}" in ${path.basename(sourceFile)}: no eligible user-level or plugin source`,
    })),
  );

  return {
    records,
    ambiguousLineNumbers: [],
    diagnostics,
  };
}

function claudeSkillName(block: unknown): string | undefined {
  if (!isRecord(block) || block.type !== 'tool_use' || block.name !== 'Skill' || !isRecord(block.input)) {
    return undefined;
  }
  return stringValue(block.input.skill)?.trim() || undefined;
}

function parseJsonlRecords(lines: string[]): { records: ParsedJsonlRecord[]; malformedLineCount: number } {
  const records: ParsedJsonlRecord[] = [];
  let malformedLineCount = 0;
  for (const [lineIndex, line] of lines.entries()) {
    try {
      const value: unknown = JSON.parse(line);
      if (isRecord(value)) records.push({ lineIndex, value });
    } catch {
      malformedLineCount += 1;
    }
  }
  return { records, malformedLineCount };
}

function resolveClaudeSkillSource(matches: ClaudeSkillCandidate[]): {
  skillPath?: string;
  resolvedPath?: string;
  confirmed: boolean;
} {
  const resolvedPaths = [...new Set(matches.map((candidate) => candidate.resolvedPath))];
  if (resolvedPaths.length !== 1) return { confirmed: false };
  return {
    skillPath: matches.length === 1 ? matches[0].skillPath : undefined,
    resolvedPath: resolvedPaths[0],
    confirmed: true,
  };
}

function claudeInvocationRecordId(
  provider: string,
  realArtifactPath: string,
  sessionId: string,
  messageId: string,
  toolUseId: string,
): string {
  return createHash('sha256')
    .update(JSON.stringify({ provider, realArtifactPath, sessionId, messageId, toolUseId }))
    .digest('hex');
}

async function readClaudeSkillCandidates(roots: string[]): Promise<ClaudeSkillCandidate[]> {
  const candidates: ClaudeSkillCandidate[] = [];
  for (const root of roots) {
    for (const skillPath of await listSkillMdFiles(root)) {
      const content = await readFile(skillPath, 'utf-8').catch(() => '');
      if (!content) continue;
      try {
        const parsed = parseSkillMd(content);
        const name = parsed.name.trim();
        if (!name) continue;
        candidates.push({
          name,
          skillPath,
          resolvedPath: await realpath(skillPath).catch(() => skillPath),
        });
      } catch {
        // Invalid skill metadata is not eligible Claude runtime source evidence.
      }
    }
  }
  return candidates;
}

async function listSkillMdFiles(root: string, ancestorRealPaths = new Set<string>()): Promise<string[]> {
  const resolvedRoot = await realpath(root).catch(() => root);
  if (ancestorRealPaths.has(resolvedRoot)) return [];
  const nextAncestors = new Set(ancestorRealPaths).add(resolvedRoot);
  const entries = await readdir(root, { withFileTypes: true }).catch((err) => {
    if (isNodeError(err) && err.code === 'ENOENT') return [];
    throw err;
  });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) return listSkillMdFiles(entryPath, nextAncestors);
      if (entry.isSymbolicLink()) {
        const metadata = await stat(entryPath).catch(() => undefined);
        if (metadata?.isDirectory()) {
          const skillPath = path.join(entryPath, 'SKILL.md');
          const skillMetadata = await stat(skillPath).catch(() => undefined);
          return skillMetadata?.isFile() ? [skillPath] : listSkillMdFiles(entryPath, nextAncestors);
        }
        return metadata?.isFile() && entry.name === 'SKILL.md' ? [entryPath] : [];
      }
      return entry.isFile() && entry.name === 'SKILL.md' ? [entryPath] : [];
    }),
  );
  return files.flat();
}

async function readSkillIdentity(skillPath: string): Promise<{
  name: string;
  resolvedPath?: string;
  confirmed: boolean;
}> {
  const resolvedPath = await realpath(skillPath).catch(() => undefined);
  return {
    name: normalizeSkillNameFromPath(resolvedPath ?? skillPath),
    resolvedPath,
    confirmed: resolvedPath !== undefined,
  };
}

function normalizeSkillNameFromPath(skillPath: string): string {
  const normalized = path.normalize(skillPath);
  const skillName = path.basename(path.dirname(normalized));
  const pluginName = parseCodexPluginSkillPath(normalized)?.plugin;
  return pluginName ? `${pluginName}:${skillName}` : skillName;
}

function parseCodexPluginSkillPath(skillPath: string):
  | {
      marketplace: string;
      plugin: string;
      relativeSkillPath: string;
    }
  | undefined {
  const normalized = path.normalize(skillPath);
  const parts = normalized.split(path.sep).filter(Boolean);
  const cacheIndex = parts.findIndex(
    (part, index) => part === 'cache' && parts[index - 1] === 'plugins' && parts[index - 2] === '.codex',
  );
  if (cacheIndex < 0) return undefined;

  const marketplace = parts[cacheIndex + 1];
  const plugin = parts[cacheIndex + 2];
  const skillsIndex = parts.indexOf('skills', cacheIndex + 3);
  const relativeSkillPath = skillsIndex >= 0 ? parts.slice(skillsIndex + 1).join('/') : '';
  if (!marketplace || !plugin || !relativeSkillPath) return undefined;

  return { marketplace, plugin, relativeSkillPath };
}

function mergeInvocationStatus(left: SkillInvocationStatus, right: SkillInvocationStatus): SkillInvocationStatus {
  if (left === 'used' || right === 'used') return 'used';
  if (left === 'failed' || right === 'failed') return 'failed';
  if (left === 'loaded' || right === 'loaded') return 'loaded';
  return 'unknown';
}

function commonPathEvidence(left: string | undefined, right: string | undefined): string | undefined {
  return left === right ? left : undefined;
}

function invocationRecordId(
  provider: string,
  sessionId: string,
  turnId: string,
  skillName: string,
  sourceIdentity: string,
): string {
  return createHash('sha256')
    .update(JSON.stringify({ provider, sessionId, turnId, skillName, sourceIdentity }))
    .digest('hex');
}

function buildHeatmap(records: SkillInvocationRecord[], range: SkillUsageRange): SkillUsageHeatmapCell[] {
  const byDate = new Map<string, SkillUsageHeatmapCell>();
  for (const date of datesInRange(range)) {
    byDate.set(date, { date, countedInvocations: 0, failedInvocations: 0 });
  }
  for (const record of records) {
    const date = record.startedAt.slice(0, 10);
    const cell = byDate.get(date) ?? { date, countedInvocations: 0, failedInvocations: 0 };
    if (record.status === 'failed') {
      cell.failedInvocations += 1;
    } else {
      cell.countedInvocations += 1;
    }
    byDate.set(date, cell);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function datesInRange(range: SkillUsageRange): string[] {
  const dates: string[] = [];
  const current = new Date(`${range.from}T00:00:00.000Z`);
  const end = new Date(`${range.to}T00:00:00.000Z`);
  while (current <= end) {
    dates.push(formatDate(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function buildRanking(records: SkillInvocationRecord[]): ProviderSkillRankingRow[] {
  const rows = new Map<string, ProviderSkillUsageAccumulator>();
  for (const record of records) {
    const rowKey = usageRowKey(record);
    const accumulator = rows.get(rowKey) ?? createUsageAccumulator(record);
    addRecordToUsageAccumulator(accumulator, record);
    rows.set(rowKey, accumulator);
  }

  return [...rows.values()].map(finalizeUsageRow).sort(compareUsageRows).slice(0, 10);
}

function buildDailySkillUsage(records: SkillInvocationRecord[], range: SkillUsageRange): ProviderSkillDailyUsage[] {
  const byDate = new Map<string, Map<string, ProviderSkillUsageAccumulator>>();
  for (const date of datesInRange(range)) byDate.set(date, new Map());

  for (const record of records) {
    const date = record.startedAt.slice(0, 10);
    const rows = byDate.get(date) ?? new Map<string, ProviderSkillUsageAccumulator>();
    const rowKey = usageRowKey(record);
    const accumulator = rows.get(rowKey) ?? createUsageAccumulator(record);
    addRecordToUsageAccumulator(accumulator, record);
    rows.set(rowKey, accumulator);
    byDate.set(date, rows);
  }

  return [...byDate.entries()]
    .map(([date, rows]) => ({
      date,
      rows: [...rows.values()].map(finalizeUsageRow).sort(compareUsageRows),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function usageRowKey(record: SkillInvocationRecord): string {
  return `${record.skillName}\0${skillSourceIdentity(record)}`;
}

function skillSourceIdentity(record: Pick<SkillInvocationRecord, 'provider' | 'skillPath' | 'resolvedPath'>): string {
  const pluginSkill =
    record.provider === 'codex'
      ? (parseCodexPluginSkillPath(record.skillPath ?? '') ?? parseCodexPluginSkillPath(record.resolvedPath ?? ''))
      : undefined;
  if (pluginSkill) {
    return `codex-plugin\0${pluginSkill.marketplace}\0${pluginSkill.plugin}\0${pluginSkill.relativeSkillPath}`;
  }
  return record.resolvedPath ?? record.skillPath ?? '';
}

function createUsageAccumulator(record: SkillInvocationRecord): ProviderSkillUsageAccumulator {
  return {
    row: {
      skillName: record.skillName,
      countedInvocations: 0,
      failedInvocations: 0,
    },
    recordCount: 0,
    providerPathCount: 0,
    providerPaths: new Set(),
    resolvedPathCount: 0,
    resolvedPaths: new Set(),
  };
}

function addRecordToUsageAccumulator(accumulator: ProviderSkillUsageAccumulator, record: SkillInvocationRecord): void {
  accumulator.recordCount += 1;
  if (record.skillPath) {
    accumulator.providerPathCount += 1;
    accumulator.providerPaths.add(record.skillPath);
  }
  if (record.resolvedPath) {
    accumulator.resolvedPathCount += 1;
    accumulator.resolvedPaths.add(record.resolvedPath);
  }
  if (record.status === 'failed') {
    accumulator.row.failedInvocations += 1;
  } else {
    accumulator.row.countedInvocations += 1;
  }
  if (!accumulator.row.lastInvokedAt || record.startedAt > accumulator.row.lastInvokedAt) {
    accumulator.row.lastInvokedAt = record.startedAt;
  }
}

function finalizeUsageRow(accumulator: ProviderSkillUsageAccumulator): ProviderSkillUsageRow {
  const commonProviderPath =
    accumulator.providerPathCount === accumulator.recordCount && accumulator.providerPaths.size === 1
      ? [...accumulator.providerPaths][0]
      : undefined;
  const commonResolvedPath =
    accumulator.resolvedPathCount === accumulator.recordCount && accumulator.resolvedPaths.size === 1
      ? [...accumulator.resolvedPaths][0]
      : undefined;
  return {
    ...accumulator.row,
    sourcePath: commonProviderPath ?? commonResolvedPath,
  };
}

function compareUsageRows(a: ProviderSkillUsageRow, b: ProviderSkillUsageRow): number {
  return (
    b.countedInvocations - a.countedInvocations ||
    b.failedInvocations - a.failedInvocations ||
    compareOptionalTimestampDesc(a.lastInvokedAt, b.lastInvokedAt) ||
    a.skillName.localeCompare(b.skillName)
  );
}

function compareOptionalTimestampDesc(left: string | undefined, right: string | undefined): number {
  if (left === right) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  return right.localeCompare(left);
}

function findCurrentSkillSource(
  record: Pick<SkillInvocationRecord, 'provider' | 'skillName' | 'skillPath' | 'resolvedPath'>,
  currentSkills: CurrentSkillReference[] | undefined,
): SkillInvocationSource | undefined {
  const skill = currentSkills?.find((candidate) => matchesCurrentSkill(record, candidate));
  return skill?.source;
}

function matchesCurrentSkill(
  record: Pick<SkillInvocationRecord, 'provider' | 'skillName' | 'skillPath' | 'resolvedPath'>,
  skill: CurrentSkillReference,
): boolean {
  if (record.skillPath !== undefined && skill.path !== undefined && matchesSkillMdPath(record.skillPath, skill.path))
    return true;
  if (
    record.resolvedPath !== undefined &&
    skill.resolvedPath !== undefined &&
    matchesSkillMdPath(record.resolvedPath, skill.resolvedPath)
  )
    return true;
  return skill.provider === record.provider && skill.name === record.skillName;
}

function matchesSkillMdPath(recordPath: string, skillReferencePath: string): boolean {
  const normalizedRecordPath = path.normalize(recordPath);
  const normalizedSkillPath = path.normalize(skillReferencePath);
  return (
    normalizedRecordPath === normalizedSkillPath || normalizedRecordPath === path.join(normalizedSkillPath, 'SKILL.md')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isValidInvocationTimestamp(value: string | undefined): value is string {
  return value !== undefined && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && 'code' in value;
}
