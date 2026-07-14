import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function isMissingFile(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function readJsonSettings(filePath: string): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(filePath, 'utf-8');
    if (!content.trim()) return {};
    const parsed = JSON.parse(content) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch (err) {
    if (isMissingFile(err)) return {};
    throw err;
  }
}

export async function writeJsonSettings(filePath: string, settings: Record<string, unknown>): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8');
}

interface CodexSkillConfigEntry {
  path?: string;
  enabled?: boolean;
  startLine: number;
  endLine: number;
  pathLine?: number;
  enabledLine?: number;
}

interface CodexPluginConfigEntry {
  pluginId: string;
  enabled?: boolean;
  startLine: number;
  endLine: number;
  enabledLine?: number;
}

function parseTomlString(raw: string): string | undefined {
  const value = raw.trim();
  if (value.startsWith('"')) {
    const match = value.match(/^"(?:\\.|[^"\\])*"/);
    if (!match) return undefined;
    try {
      return JSON.parse(match[0]) as string;
    } catch {
      return undefined;
    }
  }
  if (value.startsWith("'")) {
    const match = value.match(/^'([^']*)'/);
    return match?.[1];
  }
  return undefined;
}

function parseCodexSkillConfigEntries(text: string): CodexSkillConfigEntry[] {
  const lines = text.split('\n');
  const entries: CodexSkillConfigEntry[] = [];
  let current: CodexSkillConfigEntry | undefined;

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed === '[[skills.config]]') {
      if (current) {
        current.endLine = index;
        entries.push(current);
      }
      current = { startLine: index, endLine: lines.length };
      continue;
    }
    if (current && /^\[{1,2}[^\]]+\]{1,2}$/.test(trimmed)) {
      current.endLine = index;
      entries.push(current);
      current = undefined;
      continue;
    }
    if (!current) continue;

    const pathMatch = line.match(/^\s*path\s*=\s*(.+)$/);
    if (pathMatch) {
      current.path = parseTomlString(pathMatch[1]);
      current.pathLine = index;
      continue;
    }

    const enabledMatch = line.match(/^\s*enabled\s*=\s*(true|false)\b/);
    if (enabledMatch) {
      current.enabled = enabledMatch[1] === 'true';
      current.enabledLine = index;
    }
  }

  if (current) entries.push(current);
  return entries;
}

function parseCodexPluginHeader(trimmed: string): string | undefined {
  const match = trimmed.match(/^\[plugins\.((?:"(?:\\.|[^"\\])*")|(?:'[^']*'))\]$/);
  if (!match) return undefined;
  return parseTomlString(match[1]);
}

function parseCodexPluginConfigEntries(text: string): CodexPluginConfigEntry[] {
  const lines = text.split('\n');
  const entries: CodexPluginConfigEntry[] = [];
  let current: CodexPluginConfigEntry | undefined;

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    const pluginId = parseCodexPluginHeader(trimmed);
    if (pluginId) {
      if (current) {
        current.endLine = index;
        entries.push(current);
      }
      current = { pluginId, startLine: index, endLine: lines.length };
      continue;
    }
    if (current && /^\[{1,2}[^\]]+\]{1,2}$/.test(trimmed)) {
      current.endLine = index;
      entries.push(current);
      current = undefined;
      continue;
    }
    if (!current) continue;

    const enabledMatch = line.match(/^\s*enabled\s*=\s*(true|false)\b/);
    if (enabledMatch) {
      current.enabled = enabledMatch[1] === 'true';
      current.enabledLine = index;
    }
  }

  if (current) entries.push(current);
  return entries;
}

async function readTextIfExists(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch (err) {
    if (isMissingFile(err)) return '';
    throw err;
  }
}

export async function readCodexSkillConfigEnabled(
  configPath: string,
  skillMdPath: string,
): Promise<boolean | undefined> {
  const text = await readTextIfExists(configPath);
  const target = path.resolve(skillMdPath);
  const entry = parseCodexSkillConfigEntries(text).find((item) => item.path && path.resolve(item.path) === target);
  return entry?.enabled;
}

export async function readCodexPluginConfig(configPath: string): Promise<Record<string, boolean | undefined>> {
  const text = await readTextIfExists(configPath);
  return Object.fromEntries(parseCodexPluginConfigEntries(text).map((entry) => [entry.pluginId, entry.enabled]));
}

export async function readCodexPluginEnabled(configPath: string, pluginId: string): Promise<boolean | undefined> {
  const config = await readCodexPluginConfig(configPath);
  return config[pluginId];
}

export async function writeCodexSkillConfigEnabled(
  configPath: string,
  skillMdPath: string,
  enabled: boolean,
): Promise<void> {
  const text = await readTextIfExists(configPath);
  const lines = text ? text.split('\n') : [];
  const target = path.resolve(skillMdPath);
  const entry = parseCodexSkillConfigEntries(text).find((item) => item.path && path.resolve(item.path) === target);
  const enabledLine = `enabled = ${enabled ? 'true' : 'false'}`;

  if (entry) {
    if (entry.enabledLine !== undefined) {
      const indent = lines[entry.enabledLine]?.match(/^\s*/)?.[0] ?? '';
      lines[entry.enabledLine] = `${indent}${enabledLine}`;
    } else {
      lines.splice((entry.pathLine ?? entry.startLine) + 1, 0, enabledLine);
    }
  } else {
    if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
    lines.push('[[skills.config]]', `path = ${JSON.stringify(target)}`, enabledLine);
  }

  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${lines.join('\n').replace(/\n+$/, '')}\n`, 'utf-8');
}

export async function writeCodexPluginEnabled(configPath: string, pluginId: string, enabled: boolean): Promise<void> {
  const text = await readTextIfExists(configPath);
  const lines = text ? text.split('\n') : [];
  const entry = parseCodexPluginConfigEntries(text).find((item) => item.pluginId === pluginId);
  const enabledLine = `enabled = ${enabled ? 'true' : 'false'}`;

  if (entry) {
    if (entry.enabledLine !== undefined) {
      const indent = lines[entry.enabledLine]?.match(/^\s*/)?.[0] ?? '';
      lines[entry.enabledLine] = `${indent}${enabledLine}`;
    } else {
      lines.splice(entry.startLine + 1, 0, enabledLine);
    }
  } else {
    if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
    lines.push(`[plugins.${JSON.stringify(pluginId)}]`, enabledLine);
  }

  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${lines.join('\n').replace(/\n+$/, '')}\n`, 'utf-8');
}
