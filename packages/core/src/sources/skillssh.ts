import type { IInstallSource } from './source.js';
import type { UpdateCheckSkill } from './source.js';
import type { RemoteSkill, UpdateInfo, DownloadResult } from '../models/source.js';
import type { Skill } from '../models/skill.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type CommandResult = { stdout: string; stderr: string };
type CommandRunner = (command: string, args: string[], options: {
  timeout: number;
  env: NodeJS.ProcessEnv;
}) => Promise<CommandResult>;

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

export function parseSkillsShIdentifier(identifier: string): { repo: string; skill?: string } {
  const atIdx = identifier.indexOf('@');
  if (atIdx === -1) return { repo: identifier };
  return { repo: identifier.slice(0, atIdx), skill: identifier.slice(atIdx + 1) };
}

export class SkillsShSource implements IInstallSource {
  readonly id = 'skillssh';
  readonly displayName = 'skills.sh';

  constructor(private readonly runCommand: CommandRunner = execFileAsync) {}

  async search(query: string): Promise<RemoteSkill[]> {
    try {
      const { stdout, stderr } = await this.runCommand('npx', ['skills', 'find', query], {
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
    const { repo, skill } = parseSkillsShIdentifier(identifier);
    const args = ['skills', 'add', repo, '-g', '-y'];
    if (skill) args.push('--skill', skill);

    try {
      await this.runCommand('npx', args, {
        timeout: 60_000,
        env: { ...process.env, NO_COLOR: '1' },
      });
    } catch (err: unknown) {
      const stderr = err && typeof err === 'object' && 'stderr' in err
        ? stripAnsi(String((err as { stderr: string }).stderr)).trim() : '';
      const stdout = err && typeof err === 'object' && 'stdout' in err
        ? stripAnsi(String((err as { stdout: string }).stdout)).trim() : '';
      const detail = stderr || stdout || (err instanceof Error ? err.message : String(err));
      throw new Error(`Install failed: ${detail}`);
    }
    const skillName = skill ?? repo.split('/').pop() ?? identifier;
    return { tempDir: '', skillName, files: [] };
  }

  async checkUpdate(skill: UpdateCheckSkill): Promise<UpdateInfo | null> {
    if (skill.source?.type !== 'skillssh') return null;
    try {
      return parseUpdateForSkill(await this.runCheckCommand(), skill);
    } catch { /* skip */ }
    return null;
  }

  async checkUpdates(skills: Skill[]): Promise<Array<{ skill: Skill; update: UpdateInfo }>> {
    const managedSkills = skills.filter((skill) => skill.source?.type === 'skillssh');
    if (managedSkills.length === 0) return [];

    try {
      const clean = await this.runCheckCommand();
      return managedSkills.flatMap((skill) => {
        const update = parseUpdateForSkill(clean, skill);
        return update?.hasUpdate ? [{ skill, update }] : [];
      });
    } catch {
      return [];
    }
  }

  async updateViaCli(skillName: string): Promise<void> {
    try {
      await this.runCommand('npx', ['skills', 'update', skillName, '-g', '-y'], {
        timeout: 60_000,
        env: { ...process.env, NO_COLOR: '1' },
      });
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Update failed: ${detail}`);
    }
  }

  async removeViaCli(skillName: string): Promise<void> {
    try {
      await this.runCommand('npx', ['skills', 'remove', skillName, '-g', '-y'], {
        timeout: 60_000,
        env: { ...process.env, NO_COLOR: '1' },
      });
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Remove failed: ${detail}`);
    }
  }

  private async runCheckCommand(): Promise<string> {
    const { stdout, stderr } = await this.runCommand('npx', ['skills', 'check'], {
      timeout: 30_000,
      env: { ...process.env, NO_COLOR: '1' },
    });
    return stripAnsi(stdout || stderr);
  }
}

function parseUpdateForSkill(clean: string, skill: UpdateCheckSkill): UpdateInfo | null {
  for (const line of clean.split('\n')) {
    if (!line.includes(skill.name)) continue;
    if (/update|available|outdated/i.test(line)) {
      const hashPrefix = skill.source?.skillFolderHash?.slice(0, 7);
      return {
        currentVersion: hashPrefix ?? skill.version,
        latestVersion: 'latest',
        hasUpdate: true,
      };
    }
  }

  return null;
}
