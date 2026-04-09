import type { IInstallSource } from './source.js';
import type { RemoteSkill, UpdateInfo, DownloadResult } from '../models/source.js';
import type { Skill } from '../models/skill.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class SkillsShSource implements IInstallSource {
  readonly id = 'skillssh';
  readonly displayName = 'skills.sh';

  async search(query: string): Promise<RemoteSkill[]> {
    try {
      const { stdout } = await execFileAsync('npx', ['skills', 'find', query, '--json'], { timeout: 30_000 });
      const results = JSON.parse(stdout);
      return (results as Array<Record<string, unknown>>).map((r) => ({
        name: r.name as string, description: (r.description as string) ?? '',
        source: 'skillssh' as const, identifier: r.identifier as string,
        installs: r.installs as number | undefined,
      }));
    } catch { return []; }
  }

  async fetch(identifier: string): Promise<DownloadResult> {
    await execFileAsync('npx', ['skills', 'add', identifier, '-g', '-y'], { timeout: 60_000 });
    const skillName = identifier.split('@').pop() ?? identifier;
    return { tempDir: '', skillName, files: [] };
  }

  async checkUpdate(skill: Skill): Promise<UpdateInfo | null> {
    if (skill.source?.type !== 'skillssh') return null;
    try {
      const { stdout } = await execFileAsync('npx', ['skills', 'check', '--json'], { timeout: 30_000 });
      const updates = JSON.parse(stdout);
      const match = (updates as Array<Record<string, unknown>>).find((u) => u.name === skill.name);
      if (match) return { currentVersion: skill.version, latestVersion: match.version as string, hasUpdate: true };
    } catch { /* skip */ }
    return null;
  }
}
