import type { DisableStrategy, ProviderScanPath, Skill } from '../models/index.js';
import { readdir, access, readFile, rename, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { parseSkillMd } from '../parser.js';

export interface ProviderCapabilities {
  canToggle: boolean;
}

export type SkillToggleTarget = Pick<Skill, 'name' | 'path' | 'enabled' | 'origin'>;

export interface ISkillProvider {
  readonly id: string;
  readonly displayName: string;
  readonly basePaths: string[];
  readonly capabilities: ProviderCapabilities;

  scan(): Promise<Skill[]>;
  enable(name: string): Promise<void>;
  disable(name: string): Promise<void>;
  setEnabled(skill: SkillToggleTarget, enabled: boolean): Promise<void>;
  getDisableStrategy(skill: SkillToggleTarget): DisableStrategy | undefined;
  getScanPaths(): ProviderScanPath[];
}

export abstract class BaseProvider implements ISkillProvider {
  abstract readonly id: string;
  abstract readonly displayName: string;
  abstract readonly basePaths: string[];
  abstract readonly capabilities: ProviderCapabilities;

  protected async scanBasePaths(basePaths: string[]): Promise<Skill[]> {
    const skills: Skill[] = [];
    for (const basePath of basePaths) {
      try { await access(basePath); } catch { continue; }
      const entries = await readdir(basePath, { withFileTypes: true });
      for (const entry of entries) {
        const isDisabled = entry.name.startsWith('.disabled-');
        const skillDirName = isDisabled ? entry.name.slice('.disabled-'.length) : entry.name;
        if (entry.name.startsWith('.') && !isDisabled) continue;
        let isDir = entry.isDirectory();
        if (!isDir && entry.isSymbolicLink()) {
          try {
            isDir = (await stat(path.join(basePath, entry.name))).isDirectory();
          } catch (err) {
            const skillDir = path.join(basePath, entry.name);
            skills.push({
              name: skillDirName,
              description: '',
              provider: this.id,
              path: skillDir,
              enabled: !isDisabled,
              scope: 'global',
              metadata: {},
              source: { type: 'local' },
              scanIssues: [{
                code: 'broken-symlink',
                message: err instanceof Error ? err.message : 'Broken skill symlink',
              }],
            });
            continue;
          }
        }
        if (!isDir) continue;
        const skillDir = path.join(basePath, entry.name);
        const skillMdPath = path.join(skillDir, 'SKILL.md');
        let content: string;
        try {
          content = await readFile(skillMdPath, 'utf-8');
        } catch {
          continue;
        }
        try {
          const parsed = parseSkillMd(content);
          const resolved = await realpath(skillDir);
          const dirStat = await stat(resolved);
          skills.push({
            name: parsed.name || skillDirName,
            description: parsed.description,
            provider: this.id,
            path: skillDir,
            resolvedPath: resolved !== skillDir ? resolved : undefined,
            version: parsed.raw.version as string | undefined,
            enabled: !isDisabled,
            scope: 'global',
            metadata: { license: parsed.metadata.license, author: parsed.metadata.author, tags: parsed.metadata.tags },
            source: { type: 'local', createdAt: dirStat.birthtime.toISOString() },
          });
        } catch (err) {
          const resolved = await realpath(skillDir).catch(() => skillDir);
          const dirStat = await stat(resolved).catch(() => undefined);
          skills.push({
            name: skillDirName,
            description: '',
            provider: this.id,
            path: skillDir,
            resolvedPath: resolved !== skillDir ? resolved : undefined,
            enabled: !isDisabled,
            scope: 'global',
            metadata: {},
            source: { type: 'local', createdAt: dirStat?.birthtime.toISOString() },
            scanIssues: [{
              code: 'invalid-skill-md',
              message: err instanceof Error ? err.message : 'Invalid SKILL.md',
            }],
          });
        }
      }
    }
    return skills;
  }

  async scan(): Promise<Skill[]> {
    return this.scanBasePaths(this.basePaths);
  }

  getDisableStrategy(_skill: SkillToggleTarget): DisableStrategy | undefined {
    if (!this.capabilities.canToggle) return undefined;
    return {
      type: 'disabled-directory',
      description: 'Renames the skill directory with a .disabled- prefix',
    };
  }

  getScanPaths(): ProviderScanPath[] {
    return this.basePaths.map((basePath) => ({
      path: basePath,
      kind: 'skill-root',
      label: `${this.displayName} skill root`,
    }));
  }

  async setEnabled(skill: SkillToggleTarget, enabled: boolean): Promise<void> {
    if (!this.capabilities.canToggle) {
      throw new Error(`${this.displayName} does not support toggle`);
    }
    if (skill.enabled === enabled) return;

    const currentName = path.basename(skill.path);
    const bareName = currentName.replace(/^\.disabled-/, '');
    const destName = enabled ? bareName : `.disabled-${bareName}`;
    const dest = path.join(path.dirname(skill.path), destName);
    if (dest === skill.path) return;
    await access(dest).then(
      () => { throw new Error(`Target ${dest} already exists`); },
      () => { /* dest doesn't exist, good */ },
    );
    await rename(skill.path, dest);
  }

  async enable(name: string): Promise<void> {
    for (const basePath of this.basePaths) {
      const src = path.join(basePath, `.disabled-${name}`);
      const dest = path.join(basePath, name);
      try {
        await access(src);
        await rename(src, dest);
        return;
      } catch { /* not found in this basePath, try next */ }
    }
    throw new Error(`Disabled skill "${name}" not found in ${this.displayName}`);
  }

  async disable(name: string): Promise<void> {
    for (const basePath of this.basePaths) {
      const src = path.join(basePath, name);
      const dest = path.join(basePath, `.disabled-${name}`);
      try {
        await access(src);
        await access(dest).then(
          () => { throw new Error(`Target ${dest} already exists`); },
          () => { /* dest doesn't exist, good */ },
        );
        await rename(src, dest);
        return;
      } catch (err) {
        if ((err as Error).message?.includes('already exists')) throw err;
      }
    }
    throw new Error(`Skill "${name}" not found in ${this.displayName}`);
  }
}
