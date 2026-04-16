import type { IInstallSource } from './source.js';
import type { RemoteSkill, UpdateInfo, DownloadResult } from '../models/source.js';
import type { Skill } from '../models/skill.js';
import { execFile } from 'node:child_process';
import { mkdtemp, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function parseGitHubIdentifier(identifier: string): { owner: string; repo: string; ref: string; path: string } {
  const urlMatch = identifier.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)/);
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2], ref: urlMatch[3], path: urlMatch[4] };
  const atMatch = identifier.match(/^([^/]+)\/([^@]+)@(.+)$/);
  if (atMatch) return { owner: atMatch[1], repo: atMatch[2], ref: 'main', path: atMatch[3] };
  const slashMatch = identifier.match(/^([^/]+)\/([^/]+)$/);
  if (slashMatch) return { owner: slashMatch[1], repo: slashMatch[2], ref: 'main', path: '.' };
  throw new Error(`Cannot parse GitHub identifier: ${identifier}`);
}

export class GitHubSource implements IInstallSource {
  readonly id = 'github';
  readonly displayName = 'GitHub';

  async search(query: string): Promise<RemoteSkill[]> {
    try {
      const parsed = parseGitHubIdentifier(query);
      const skillName = parsed.path === '.' ? parsed.repo : path.basename(parsed.path);
      return [{
        name: skillName,
        description: `${parsed.owner}/${parsed.repo}` + (parsed.path !== '.' ? ` → ${parsed.path}` : ''),
        source: 'github',
        identifier: query,
      }];
    } catch {
      return [];
    }
  }

  async fetch(identifier: string): Promise<DownloadResult> {
    const parsed = parseGitHubIdentifier(identifier);
    const tempDir = await mkdtemp(path.join(tmpdir(), 'skillpack-gh-'));
    const repoUrl = `https://github.com/${parsed.owner}/${parsed.repo}.git`;
    await execFileAsync('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse', '--branch', parsed.ref, repoUrl, tempDir]);

    if (parsed.path !== '.') {
      const candidates = [parsed.path, `skills/${parsed.path}`];
      await execFileAsync('git', ['-C', tempDir, 'sparse-checkout', 'set', ...candidates]);

      const resolvedPath = (await Promise.all(
        candidates.map(async (c) => {
          try { await access(path.join(tempDir, c, 'SKILL.md')); return c; } catch { return null; }
        }),
      )).find((c) => c !== null);

      if (!resolvedPath) {
        throw new Error(`Skill not found at "${parsed.path}" or "skills/${parsed.path}" in ${parsed.owner}/${parsed.repo}`);
      }

      const skillName = path.basename(resolvedPath);
      return { tempDir: path.join(tempDir, resolvedPath), skillName, files: [] };
    }

    return { tempDir, skillName: parsed.repo, files: [] };
  }

  async checkUpdate(skill: Skill): Promise<UpdateInfo | null> {
    if (!skill.source?.repo || !skill.source?.commit) return null;
    try {
      const { stdout } = await execFileAsync('git', ['ls-remote', `https://github.com/${skill.source.repo}.git`, skill.source.ref || 'HEAD']);
      const latestCommit = stdout.split('\t')[0];
      if (latestCommit && latestCommit !== skill.source.commit) {
        return { currentVersion: skill.source.commit.slice(0, 7), latestVersion: latestCommit.slice(0, 7), hasUpdate: true };
      }
    } catch { /* skip */ }
    return null;
  }
}
