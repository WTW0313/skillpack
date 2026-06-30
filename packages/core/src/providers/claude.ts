import { BaseProvider, type ProviderCapabilities } from './provider.js';
import type { DisableStrategy, ProviderScanPath, Skill } from '../models/index.js';
import { readJsonSettings, writeJsonSettings } from './provider-settings.js';
import { readdir, readFile, access, rename, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseSkillMd } from '../parser.js';

async function isDirEntry(entry: { isDirectory(): boolean; isSymbolicLink(): boolean; name: string }, parentPath: string): Promise<boolean> {
  if (entry.isDirectory()) return true;
  if (entry.isSymbolicLink()) {
    try { return (await stat(path.join(parentPath, entry.name))).isDirectory(); } catch { return false; }
  }
  return false;
}

export class ClaudeProvider extends BaseProvider {
  readonly id = 'claude';
  readonly displayName = 'Claude';
  readonly basePaths: string[];
  readonly capabilities: ProviderCapabilities = {
    canInstall: false, canUninstall: false, canUpdate: false, canToggle: true, canCreate: false,
  };
  readonly flatPaths: string[];
  readonly settingsPath: string;

  constructor(basePaths?: string[], flatPaths?: string[], settingsPath?: string) {
    super();
    this.basePaths = basePaths ?? [path.join(os.homedir(), '.claude', 'plugins', 'cache')];
    this.flatPaths = flatPaths ?? [path.join(os.homedir(), '.claude', 'skills')];
    this.settingsPath = settingsPath ?? path.join(os.homedir(), '.claude', 'settings.json');
  }

  override async scan(): Promise<Skill[]> {
    const settings = await readClaudeSettings(this.settingsPath);
    const flatSkills = await this.scanFlat(settings);
    const deepSkills = await this.scanDeep(settings);
    return [...flatSkills, ...deepSkills];
  }

  override getScanPaths(): ProviderScanPath[] {
    return [
      ...this.flatPaths.map((flatPath) => ({
        path: flatPath,
        kind: 'skill-root' as const,
        label: 'Claude skill root',
      })),
      ...this.basePaths.map((basePath) => ({
        path: basePath,
        kind: 'plugin-cache' as const,
        label: 'Claude plugin cache',
      })),
    ];
  }

  override getDisableStrategy(skill: Pick<Skill, 'name' | 'path' | 'enabled'>): DisableStrategy | undefined {
    if (!this.capabilities.canToggle) return undefined;
    if (path.basename(skill.path).startsWith('.disabled-')) return super.getDisableStrategy(skill);
    if (this.getFlatSkillName(skill.path)) {
      return {
        type: 'provider-config',
        description: 'Writes skillOverrides in Claude settings.json',
      };
    }
    if (this.getPluginId(skill.path)) {
      return {
        type: 'provider-config',
        description: 'Writes enabledPlugins in Claude settings.json for the owning plugin',
      };
    }
    return super.getDisableStrategy(skill);
  }

  override async setEnabled(skill: Pick<Skill, 'name' | 'path' | 'enabled'>, enabled: boolean): Promise<void> {
    if (skill.enabled === enabled) return;
    if (path.basename(skill.path).startsWith('.disabled-')) {
      await super.setEnabled(skill, enabled);
      return;
    }

    const flatSkillName = this.getFlatSkillName(skill.path);
    if (flatSkillName) {
      await setClaudeSkillOverride(this.settingsPath, skill.name, enabled ? 'on' : 'off');
      return;
    }

    const pluginId = this.getPluginId(skill.path);
    if (pluginId) {
      await setClaudePluginEnabled(this.settingsPath, pluginId, enabled);
      return;
    }

    await super.setEnabled(skill, enabled);
  }

  private async scanFlat(settings: ClaudeSettings): Promise<Skill[]> {
    const skills: Skill[] = [];
    const skillOverrides = getStringRecord(settings.skillOverrides);
    for (const basePath of this.flatPaths) {
      try { await access(basePath); } catch { continue; }
      const entries = await readdir(basePath, { withFileTypes: true });
      for (const entry of entries) {
        let isDir = entry.isDirectory();
        if (!isDir && entry.isSymbolicLink()) {
          try { isDir = (await stat(path.join(basePath, entry.name))).isDirectory(); } catch { continue; }
        }
        if (!isDir) continue;
        const isDisabled = entry.name.startsWith('.disabled-');
        const skillDirName = isDisabled ? entry.name.slice('.disabled-'.length) : entry.name;
        if (entry.name.startsWith('.') && !isDisabled) continue;
        const skillDir = path.join(basePath, entry.name);
        const skillMdPath = path.join(skillDir, 'SKILL.md');
        try {
          const content = await readFile(skillMdPath, 'utf-8');
          const parsed = parseSkillMd(content);
          const resolved = await realpath(skillDir);
          const dirStat = await stat(resolved);
          const skillName = parsed.name || skillDirName;
          const override = skillOverrides[skillName];
          skills.push({
            name: skillName,
            description: parsed.description,
            provider: this.id,
            path: skillDir,
            resolvedPath: resolved !== skillDir ? resolved : undefined,
            version: parsed.raw.version as string | undefined,
            enabled: !isDisabled && override !== 'off',
            scope: 'global',
            metadata: { license: parsed.metadata.license, author: parsed.metadata.author, tags: parsed.metadata.tags },
            source: { type: 'local', createdAt: dirStat.birthtime.toISOString() },
          });
        } catch { /* skip */ }
      }
    }
    return skills;
  }

  private async scanDeep(settings: ClaudeSettings): Promise<Skill[]> {
    const skills: Skill[] = [];
    const enabledPlugins = getBooleanRecord(settings.enabledPlugins);
    for (const basePath of this.basePaths) {
      try { await access(basePath); } catch { continue; }
      const publishers = await readdir(basePath, { withFileTypes: true });
      for (const pub of publishers) {
        if (!(await isDirEntry(pub, basePath))) continue;
        const pubPath = path.join(basePath, pub.name);
        const plugins = await readdir(pubPath, { withFileTypes: true });
        for (const plugin of plugins) {
          if (!(await isDirEntry(plugin, pubPath))) continue;
          const pluginPath = path.join(pubPath, plugin.name);
          const pluginEnabled = enabledPlugins[`${plugin.name}@${pub.name}`] !== false;
          const versions = await readdir(pluginPath, { withFileTypes: true });
          for (const ver of versions) {
            if (!(await isDirEntry(ver, pluginPath))) continue;
            const skillsDir = path.join(pluginPath, ver.name, 'skills');
            try { await access(skillsDir); } catch { continue; }
            const skillEntries = await readdir(skillsDir, { withFileTypes: true });
            for (const entry of skillEntries) {
              if (!(await isDirEntry(entry, skillsDir))) continue;
              const isDisabled = entry.name.startsWith('.disabled-');
              const skillDirName = isDisabled ? entry.name.slice('.disabled-'.length) : entry.name;
              if (entry.name.startsWith('.') && !isDisabled) continue;
              const skillPath = path.join(skillsDir, entry.name);
              const skillMdPath = path.join(skillPath, 'SKILL.md');
              try {
                const content = await readFile(skillMdPath, 'utf-8');
                const parsed = parseSkillMd(content);
                const resolved = await realpath(skillPath);
                const dirStat = await stat(resolved);
                skills.push({
                  name: parsed.name || skillDirName, description: parsed.description,
                  provider: this.id, path: skillPath,
                  resolvedPath: resolved !== skillPath ? resolved : undefined,
                  version: ver.name !== 'unknown' ? ver.name : undefined,
                  enabled: !isDisabled && pluginEnabled, scope: 'global',
                  metadata: { license: parsed.metadata.license, author: parsed.metadata.author ?? pub.name, tags: parsed.metadata.tags },
                  source: { type: 'local', createdAt: dirStat.birthtime.toISOString() },
                });
              } catch { /* skip */ }
            }
          }
        }
      }
    }
    return skills;
  }

  private getFlatSkillName(skillPath: string): string | undefined {
    for (const flatPath of this.flatPaths) {
      const rel = path.relative(path.resolve(flatPath), path.resolve(skillPath));
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue;
      const segments = rel.split(path.sep);
      if (segments.length === 1) return segments[0].replace(/^\.disabled-/, '');
    }
    return undefined;
  }

  private getPluginId(skillPath: string): string | undefined {
    for (const basePath of this.basePaths) {
      const rel = path.relative(path.resolve(basePath), path.resolve(skillPath));
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue;
      const segments = rel.split(path.sep);
      if (segments.length >= 5 && segments[3] === 'skills') {
        return `${segments[1]}@${segments[0]}`;
      }
    }
    return undefined;
  }

  override async disable(name: string): Promise<void> {
    const skill = (await this.scan()).find((item) => item.name === name || path.basename(item.path).replace(/^\.disabled-/, '') === name);
    if (skill) {
      await this.setEnabled(skill, false);
      return;
    }

    // Try flat paths first (e.g. ~/.claude/skills/)
    for (const fp of this.flatPaths) {
      const src = path.join(fp, name);
      const dest = path.join(fp, `.disabled-${name}`);
      try {
        await access(src);
        await access(dest).then(
          () => { throw new Error(`Target ${dest} already exists`); },
          () => { /* good */ },
        );
        await rename(src, dest);
        return;
      } catch (err) {
        if ((err as Error).message?.includes('already exists')) throw err;
      }
    }
    // Then deep cache paths
    for (const basePath of this.basePaths) {
      try { await access(basePath); } catch { continue; }
      const publishers = await readdir(basePath, { withFileTypes: true });
      for (const pub of publishers) {
        if (!(await isDirEntry(pub, basePath))) continue;
        const pubPath = path.join(basePath, pub.name);
        const plugins = await readdir(pubPath, { withFileTypes: true });
        for (const plugin of plugins) {
          if (!(await isDirEntry(plugin, pubPath))) continue;
          const pluginPath = path.join(pubPath, plugin.name);
          const versions = await readdir(pluginPath, { withFileTypes: true });
          for (const ver of versions) {
            if (!(await isDirEntry(ver, pluginPath))) continue;
            const skillsDir = path.join(pluginPath, ver.name, 'skills');
            try { await access(skillsDir); } catch { continue; }
            const src = path.join(skillsDir, name);
            const dest = path.join(skillsDir, `.disabled-${name}`);
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
        }
      }
    }
    throw new Error(`Skill "${name}" not found in ${this.displayName}`);
  }

  override async enable(name: string): Promise<void> {
    const skill = (await this.scan()).find((item) => item.name === name || path.basename(item.path).replace(/^\.disabled-/, '') === name);
    if (skill) {
      await this.setEnabled(skill, true);
      return;
    }

    // Try flat paths first
    for (const fp of this.flatPaths) {
      const src = path.join(fp, `.disabled-${name}`);
      const dest = path.join(fp, name);
      try {
        await access(src);
        await rename(src, dest);
        return;
      } catch { /* try next */ }
    }
    // Then deep cache paths
    for (const basePath of this.basePaths) {
      try { await access(basePath); } catch { continue; }
      const publishers = await readdir(basePath, { withFileTypes: true });
      for (const pub of publishers) {
        if (!(await isDirEntry(pub, basePath))) continue;
        const pubPath = path.join(basePath, pub.name);
        const plugins = await readdir(pubPath, { withFileTypes: true });
        for (const plugin of plugins) {
          if (!(await isDirEntry(plugin, pubPath))) continue;
          const pluginPath = path.join(pubPath, plugin.name);
          const versions = await readdir(pluginPath, { withFileTypes: true });
          for (const ver of versions) {
            if (!(await isDirEntry(ver, pluginPath))) continue;
            const skillsDir = path.join(pluginPath, ver.name, 'skills');
            try { await access(skillsDir); } catch { continue; }
            const src = path.join(skillsDir, `.disabled-${name}`);
            const dest = path.join(skillsDir, name);
            try {
              await access(src);
              await rename(src, dest);
              return;
            } catch { /* not found here, try next */ }
          }
        }
      }
    }
    throw new Error(`Disabled skill "${name}" not found in ${this.displayName}`);
  }
}

type ClaudeSkillOverride = 'on' | 'name-only' | 'user-invocable-only' | 'off';

interface ClaudeSettings extends Record<string, unknown> {
  skillOverrides?: unknown;
  enabledPlugins?: unknown;
}

async function readClaudeSettings(settingsPath: string): Promise<ClaudeSettings> {
  return await readJsonSettings(settingsPath);
}

function getStringRecord(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function getBooleanRecord(value: unknown): Record<string, boolean> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'),
  );
}

async function setClaudeSkillOverride(settingsPath: string, skillName: string, state: ClaudeSkillOverride): Promise<void> {
  const settings = await readJsonSettings(settingsPath);
  settings.skillOverrides = {
    ...getStringRecord(settings.skillOverrides),
    [skillName]: state,
  };
  await writeJsonSettings(settingsPath, settings);
}

async function setClaudePluginEnabled(settingsPath: string, pluginId: string, enabled: boolean): Promise<void> {
  const settings = await readJsonSettings(settingsPath);
  settings.enabledPlugins = {
    ...getBooleanRecord(settings.enabledPlugins),
    [pluginId]: enabled,
  };
  await writeJsonSettings(settingsPath, settings);
}
