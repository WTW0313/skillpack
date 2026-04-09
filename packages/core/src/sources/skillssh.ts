import type { IInstallSource } from './source.js';
import type { RemoteSkill, UpdateInfo, DownloadResult } from '../models/source.js';
import type { Skill } from '../models/skill.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function parseSearchOutput(raw: string): RemoteSkill[] {
  const clean = stripAnsi(raw);
  const results: RemoteSkill[] = [];
  const lines = clean.split('\n');

  for (const line of lines) {
    const match = line.match(/^(\S+\/\S+@\S+)\s+(\S+)\s+installs?/);
    if (!match) continue;
    const identifier = match[1];
    const installs = parseFloat(match[2].replace(/K/i, '')) * (match[2].includes('K') || match[2].includes('k') ? 1000 : 1);
    const parts = identifier.split('@');
    const skillName = parts[parts.length - 1] ?? identifier;

    results.push({
      name: skillName,
      description: identifier,
      source: 'skillssh',
      identifier,
      installs: Math.round(installs),
    });
  }

  return results;
}

export class SkillsShSource implements IInstallSource {
  readonly id = 'skillssh';
  readonly displayName = 'skills.sh';

  async search(query: string): Promise<RemoteSkill[]> {
    try {
      const { stdout, stderr } = await execFileAsync('npx', ['skills', 'find', query], {
        timeout: 30_000,
        env: { ...process.env, NO_COLOR: '1' },
      });
      const output = stdout || stderr;
      return parseSearchOutput(output);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'stdout' in err) {
        return parseSearchOutput(String((err as { stdout: string }).stdout));
      }
      return [];
    }
  }

  async fetch(identifier: string): Promise<DownloadResult> {
    await execFileAsync('npx', ['skills', 'add', identifier, '-g', '-y'], { timeout: 60_000 });
    const skillName = identifier.split('@').pop() ?? identifier;
    return { tempDir: '', skillName, files: [] };
  }

  async checkUpdate(skill: Skill): Promise<UpdateInfo | null> {
    if (skill.source?.type !== 'skillssh') return null;
    try {
      const { stdout } = await execFileAsync('npx', ['skills', 'check'], { timeout: 30_000 });
      const clean = stripAnsi(stdout);
      if (clean.includes(skill.name)) {
        return { currentVersion: skill.version, latestVersion: 'latest', hasUpdate: true };
      }
    } catch { /* skip */ }
    return null;
  }
}
