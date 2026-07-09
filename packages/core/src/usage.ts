import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const USAGE_IMPORTER_VERSION = 6;

export type UsageCoverageState = 'unsupported' | 'not-configured' | 'zero' | 'active';
export type SkillInvocationStatus = 'loaded' | 'used' | 'failed' | 'unknown';

export interface SkillUsageProviderConfig {
  provider: string;
  displayName: string;
  supported: boolean;
  configured?: boolean;
  artifactRoots?: string[];
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
  artifacts: Record<string, {
    size: number;
    mtimeMs: number;
  }>;
}

interface ParsedInvocationResult {
  records: SkillInvocationRecord[];
  ambiguousLineNumbers: number[];
}

interface CodexSkillReadCandidate {
  callId: string;
  lineIndex: number;
  sessionId: string;
  turnId: string;
  startedAt: string;
  endedAt?: string;
  rawSkillPath: string;
  skillPath: string;
  statusHint?: SkillInvocationStatus;
}

export interface ProviderSkillUsageOverview {
  provider: string;
  displayName: string;
  coverageState: UsageCoverageState;
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
    const cursor = await this.readCursor(provider.provider);
    if (cursor.stale) await rm(path.join(this.dataDir, 'invocations', provider.provider), { recursive: true, force: true });
    const nextCursor: UsageImportCursor = {
      provider: provider.provider,
      artifacts: { ...cursor.artifacts },
    };

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

        const content = await readFile(file, 'utf-8').catch((err) => {
          diagnostics.push({ provider: provider.provider, message: err instanceof Error ? err.message : String(err) });
          skippedArtifacts += 1;
          return '';
        });
        if (!content) continue;

        const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
        const result = await parseCodexInvocationLines(provider.provider, file, lines, currentSkills);
        records.push(...result.records);
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
      providers: await Promise.all(this.providers.map(async (provider) => {
        if (!provider.supported) {
          return {
            provider: provider.provider,
            displayName: provider.displayName,
            coverageState: coverageStateFor(provider, 0),
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
          heatmap,
          dailySkillUsage,
          ranking,
          diagnostics: this.latestDiagnostics.get(provider.provider) ?? [],
        };
      })),
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
      const seen = existingRecordIds(existing);
      const newRecords = partitionRecords.filter((record) => {
        if (seen.has(record.recordId)) return false;
        seen.add(record.recordId);
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
    const files = await listJsonlFiles(dir).catch(() => []);
    const records: SkillInvocationRecord[] = [];

    for (const file of files) {
      const content = await readFile(file, 'utf-8').catch(() => '');
      for (const line of content.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const record = JSON.parse(line) as SkillInvocationRecord;
          const date = record.startedAt.slice(0, 10);
          if (date >= range.from && date <= range.to) records.push(record);
        } catch {
          // Ignore malformed derived records; provider import diagnostics cover source artifacts.
        }
      }
    }

    return records;
  }

  private async readCursor(provider: string): Promise<UsageImportCursor> {
    const cursorPath = path.join(this.dataDir, 'cursors', `${provider}.json`);
    const content = await readFile(cursorPath, 'utf-8').catch(() => '');
    if (!content) return { provider, artifacts: {} };
    try {
      const cursor = JSON.parse(content) as UsageImportCursor;
      if (cursor.importerVersion !== USAGE_IMPORTER_VERSION) return { provider, stale: true, artifacts: {} };
      return {
        provider,
        importerVersion: USAGE_IMPORTER_VERSION,
        artifacts: cursor.artifacts ?? {},
      };
    } catch {
      return { provider, artifacts: {} };
    }
  }

  private async writeCursor(provider: string, cursor: UsageImportCursor): Promise<void> {
    const cursorPath = path.join(this.dataDir, 'cursors', `${provider}.json`);
    await mkdir(path.dirname(cursorPath), { recursive: true });
    await writeFile(cursorPath, JSON.stringify({
      ...cursor,
      provider,
      importerVersion: USAGE_IMPORTER_VERSION,
    }, null, 2) + '\n', 'utf-8');
  }

}

function coverageStateFor(provider: SkillUsageProviderConfig, recordCount = 0): UsageCoverageState {
  if (!provider.supported) return 'unsupported';
  if (!provider.artifactRoots?.length) return 'not-configured';
  if (provider.configured === false) return 'not-configured';
  if (recordCount > 0) return 'active';
  return 'zero';
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

function recordInRange(record: SkillInvocationRecord, range: SkillUsageRange): boolean {
  const date = record.startedAt.slice(0, 10);
  return date >= range.from && date <= range.to;
}

function existingRecordIds(content: string): Set<string> {
  const ids = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line) as { recordId?: unknown };
      if (typeof value.recordId === 'string') ids.add(value.recordId);
    } catch {
      // Ignore malformed derived records when deduplicating new writes.
    }
  }
  return ids;
}

async function listJsonlFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch((err) => {
    if (isNodeError(err) && err.code === 'ENOENT') return [];
    throw err;
  });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) return listJsonlFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.jsonl') ? [entryPath] : [];
  }));
  return files.flat();
}

async function parseCodexInvocationLines(
  provider: string,
  sourceFile: string,
  lines: string[],
  currentSkills?: CurrentSkillReference[],
): Promise<ParsedInvocationResult> {
  const ambiguousLineNumbers: number[] = [];
  const candidates: CodexSkillReadCandidate[] = [];
  const outputs = new Map<string, { output: string; endedAt?: string }>();
  let sessionId = path.basename(sourceFile, '.jsonl');
  let currentTurnId = sessionId;
  let cwd: string | undefined;

  for (const [index, line] of lines.entries()) {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(value)) continue;

    const payload = isRecord(value.payload) ? value.payload : {};
    if (value.type === 'session_meta') {
      sessionId = stringValue(payload.session_id) ?? stringValue(payload.id) ?? sessionId;
      currentTurnId = sessionId;
      cwd = stringValue(payload.cwd) ?? cwd;
      continue;
    }
    if (value.type === 'event_msg' && stringValue(payload.type) === 'task_started') {
      currentTurnId = stringValue(payload.turn_id) ?? currentTurnId;
      continue;
    }
    if (value.type === 'turn_context') {
      currentTurnId = stringValue(payload.turn_id) ?? currentTurnId;
      cwd = stringValue(payload.cwd) ?? cwd;
      continue;
    }
    if (value.type !== 'response_item') continue;

    const payloadType = stringValue(payload.type);
    if (payloadType === 'function_call') {
      const callId = stringValue(payload.call_id);
      const toolName = stringValue(payload.name);
      const startedAt = stringValue(value.timestamp);
      if (!callId || toolName !== 'exec_command' || !startedAt) continue;

      const command = parseExecCommand(payload);
      if (!command?.cmd) continue;
      const skillPaths = extractDirectSkillReadPaths(command.cmd);
      if (skillPaths.length === 0) continue;

      const commandCwd = resolveCommandCwd(command.workdir, cwd);
      for (const rawSkillPath of skillPaths) {
        const skillPath = resolveSkillPath(rawSkillPath, commandCwd);
        candidates.push({
          callId,
          lineIndex: index,
          sessionId,
          turnId: currentTurnId,
          startedAt,
          rawSkillPath,
          skillPath,
          statusHint: normalizeStatus(stringValue(payload.status)),
        });
      }
    } else if (payloadType === 'function_call_output') {
      const callId = stringValue(payload.call_id);
      const output = stringValue(payload.output);
      const endedAt = stringValue(value.timestamp);
      if (callId && output) outputs.set(callId, { output, endedAt });
    }
  }

  const recordsByTurnAndSkill = new Map<string, SkillInvocationRecord>();
  for (const candidate of candidates) {
    const skillIdentity = await readSkillIdentity(candidate.skillPath, candidate.rawSkillPath);
    const skillName = skillIdentity.name;
    if (!skillName || !candidate.sessionId || !candidate.turnId || !candidate.startedAt) {
      ambiguousLineNumbers.push(candidate.lineIndex + 1);
      continue;
    }
    const evidence = statusFromToolOutput(outputs.get(candidate.callId), candidate.statusHint);
    const sourcePath = sourcePathForRecord({
      skillPath: candidate.skillPath,
      resolvedPath: skillIdentity.resolvedPath,
    });
    const recordKey = `${candidate.turnId}\0${skillName}\0${sourcePath ?? ''}`;
    const existing = recordsByTurnAndSkill.get(recordKey);
    if (existing) {
      existing.status = mergeInvocationStatus(existing.status, evidence.status);
      if (candidate.startedAt < existing.startedAt) existing.startedAt = candidate.startedAt;
      if (evidence.endedAt && (!existing.endedAt || evidence.endedAt > existing.endedAt)) existing.endedAt = evidence.endedAt;
      if (skillIdentity.confirmed) {
        existing.skillPath = candidate.skillPath;
        existing.resolvedPath = skillIdentity.resolvedPath;
        existing.identityConfidence = 'confirmed';
      }
      existing.source ??= findCurrentSkillSource({
        provider,
        skillName,
        skillPath: candidate.skillPath,
        resolvedPath: skillIdentity.resolvedPath,
      }, currentSkills);
      continue;
    }

    const source = findCurrentSkillSource({
      provider,
      skillName,
      skillPath: candidate.skillPath,
      resolvedPath: skillIdentity.resolvedPath,
    }, currentSkills);

    recordsByTurnAndSkill.set(recordKey, {
      schemaVersion: 1,
      recordId: invocationRecordId(
        provider,
        candidate.sessionId,
        candidate.turnId,
        skillName,
        sourcePath,
      ),
      provider,
      sessionId: candidate.sessionId,
      turnId: candidate.turnId,
      skillName,
      skillPath: candidate.skillPath,
      resolvedPath: skillIdentity.resolvedPath,
      source,
      identityConfidence: skillIdentity.confirmed ? 'confirmed' : 'inferred',
      status: evidence.status,
      startedAt: candidate.startedAt,
      endedAt: evidence.endedAt ?? null,
    });
  }

  return { records: [...recordsByTurnAndSkill.values()], ambiguousLineNumbers };
}

function parseExecCommand(payload: Record<string, unknown>): { cmd: string; workdir?: string } | undefined {
  const raw = stringValue(payload.arguments) ?? stringValue(payload.input);
  if (!raw) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  const cmd = stringValue(value.cmd);
  if (!cmd) return undefined;
  return {
    cmd,
    workdir: stringValue(value.workdir),
  };
}

function extractDirectSkillReadPaths(command: string): string[] {
  const paths: string[] = [];
  const segments = command.split(/\s*(?:&&|\|\||;|\n)\s*/);
  for (const segment of segments) {
    const commandName = basenameOfCommand(firstShellToken(segment));
    if (!isDirectFileReadCommand(commandName)) continue;
    paths.push(...extractSkillPaths(segment));
  }
  return paths;
}

function firstShellToken(segment: string): string | undefined {
  return segment.trim().match(/^(\S+)/)?.[1];
}

function basenameOfCommand(command: string | undefined): string | undefined {
  if (!command) return undefined;
  return path.basename(command);
}

function isDirectFileReadCommand(command: string | undefined): boolean {
  return command === 'cat'
    || command === 'sed'
    || command === 'nl'
    || command === 'head'
    || command === 'tail'
    || command === 'bat';
}

function extractSkillPaths(segment: string): string[] {
  const paths: string[] = [];
  const pathPattern = /(?:^|\s|['"])(~?\.?\.?\/?[^'"\s]*\/skills\/[^'"\s]+\/SKILL\.md)(?=$|\s|['"])/g;
  for (const match of segment.matchAll(pathPattern)) {
    const skillPath = match[1];
    if (!skillPath.includes('<') && !skillPath.includes('>')) paths.push(skillPath);
  }
  return paths;
}

function resolveCommandCwd(workdir: string | undefined, cwd: string | undefined): string | undefined {
  if (!workdir) return cwd;
  if (path.isAbsolute(workdir)) return workdir;
  return cwd ? path.resolve(cwd, workdir) : path.resolve(workdir);
}

function resolveSkillPath(rawSkillPath: string, cwd: string | undefined): string {
  if (rawSkillPath === '~') return os.homedir();
  if (rawSkillPath.startsWith('~/')) return path.join(os.homedir(), rawSkillPath.slice(2));
  if (path.isAbsolute(rawSkillPath)) return path.normalize(rawSkillPath);
  return path.resolve(cwd ?? process.cwd(), rawSkillPath);
}

async function readSkillIdentity(skillPath: string, rawSkillPath: string): Promise<{
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
  const parts = normalized.split(path.sep).filter(Boolean);
  const cacheIndex = parts.findIndex((part, index) => (
    part === 'cache' && parts[index - 1] === 'plugins' && parts[index - 2] === '.codex'
  ));
  const pluginName = cacheIndex >= 0 ? parts[cacheIndex + 2] : undefined;
  return pluginName ? `${pluginName}:${skillName}` : skillName;
}

function statusFromToolOutput(
  output: { output: string; endedAt?: string } | undefined,
  statusHint: SkillInvocationStatus | undefined,
): { status: SkillInvocationStatus; endedAt?: string } {
  const exitCode = output?.output.match(/Process exited with code\s+(\d+)/)?.[1]
    ?? output?.output.match(/Exit code:\s+(\d+)/)?.[1]
    ?? output?.output.match(/Exit status\s+(\d+)/)?.[1];
  if (exitCode !== undefined) return { status: exitCode === '0' ? 'used' : 'failed', endedAt: output?.endedAt };
  if (statusHint && statusHint !== 'unknown') return { status: statusHint, endedAt: output?.endedAt };
  return { status: 'unknown', endedAt: output?.endedAt };
}

function mergeInvocationStatus(left: SkillInvocationStatus, right: SkillInvocationStatus): SkillInvocationStatus {
  if (left === 'used' || right === 'used') return 'used';
  if (left === 'failed' || right === 'failed') return 'failed';
  if (left === 'loaded' || right === 'loaded') return 'loaded';
  return 'unknown';
}

function invocationRecordId(
  provider: string,
  sessionId: string,
  turnId: string,
  skillName: string,
  sourcePath: string | undefined,
): string {
  return createHash('sha256')
    .update(JSON.stringify({ provider, sessionId, turnId, skillName, sourcePath }))
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
  const rows = new Map<string, ProviderSkillUsageRow>();
  for (const record of records) {
    const rowKey = usageRowKey(record);
    const row = rows.get(rowKey) ?? createUsageRow(record);
    addRecordToUsageRow(row, record);
    rows.set(rowKey, row);
  }

  return [...rows.values()].sort(compareUsageRows).slice(0, 10);
}

function buildDailySkillUsage(
  records: SkillInvocationRecord[],
  range: SkillUsageRange,
): ProviderSkillDailyUsage[] {
  const byDate = new Map<string, Map<string, ProviderSkillUsageRow>>();
  for (const date of datesInRange(range)) byDate.set(date, new Map());

  for (const record of records) {
    const date = record.startedAt.slice(0, 10);
    const rows = byDate.get(date) ?? new Map<string, ProviderSkillUsageRow>();
    const rowKey = usageRowKey(record);
    const row = rows.get(rowKey) ?? createUsageRow(record);
    addRecordToUsageRow(row, record);
    rows.set(rowKey, row);
    byDate.set(date, rows);
  }

  return [...byDate.entries()].map(([date, rows]) => ({
    date,
    rows: [...rows.values()].sort(compareUsageRows),
  })).sort((a, b) => a.date.localeCompare(b.date));
}

function usageRowKey(record: SkillInvocationRecord): string {
  return `${record.skillName}\0${sourcePathForRecord(record) ?? ''}`;
}

function createUsageRow(record: SkillInvocationRecord): ProviderSkillUsageRow {
  return {
    skillName: record.skillName,
    sourcePath: sourcePathForRecord(record),
    countedInvocations: 0,
    failedInvocations: 0,
  };
}

function addRecordToUsageRow(
  row: ProviderSkillUsageRow,
  record: SkillInvocationRecord,
): void {
  if (record.status === 'failed') {
    row.failedInvocations += 1;
  } else {
    row.countedInvocations += 1;
  }
  if (!row.lastInvokedAt || record.startedAt > row.lastInvokedAt) row.lastInvokedAt = record.startedAt;
}

function compareUsageRows(a: ProviderSkillUsageRow, b: ProviderSkillUsageRow): number {
  return b.countedInvocations - a.countedInvocations
    || b.failedInvocations - a.failedInvocations
    || compareOptionalTimestampDesc(a.lastInvokedAt, b.lastInvokedAt)
    || a.skillName.localeCompare(b.skillName);
}

function compareOptionalTimestampDesc(left: string | undefined, right: string | undefined): number {
  if (left === right) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  return right.localeCompare(left);
}

function sourcePathForRecord(record: Pick<SkillInvocationRecord, 'skillPath' | 'resolvedPath'>): string | undefined {
  return record.skillPath ?? record.resolvedPath;
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
  if (record.skillPath !== undefined && skill.path !== undefined && matchesSkillMdPath(record.skillPath, skill.path)) return true;
  if (record.resolvedPath !== undefined && skill.resolvedPath !== undefined && matchesSkillMdPath(record.resolvedPath, skill.resolvedPath)) return true;
  return skill.provider === record.provider && skill.name === record.skillName;
}

function matchesSkillMdPath(recordPath: string, skillReferencePath: string): boolean {
  const normalizedRecordPath = path.normalize(recordPath);
  const normalizedSkillPath = path.normalize(skillReferencePath);
  return normalizedRecordPath === normalizedSkillPath
    || normalizedRecordPath === path.join(normalizedSkillPath, 'SKILL.md');
}

function normalizeStatus(value: string | undefined): SkillInvocationStatus {
  if (value === 'loaded' || value === 'used' || value === 'failed') return value;
  return 'unknown';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && 'code' in value;
}
