import { BaseProvider, type ProviderCapabilities } from './provider.js';
import type { Skill } from '../models/index.js';
import { parseSkillMd } from '../parser.js';
import {
  readCodexPluginConfig,
  readCodexSkillConfigEnabled,
  writeCodexPluginEnabled,
  writeCodexSkillConfigEnabled,
} from './provider-settings.js';
import { readdir, access, readFile, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

interface CodexPluginRoot {
  marketplace: string;
  pluginName: string;
  pluginId: string;
  version: string;
  path: string;
  mtimeMs: number;
  manifestName?: string;
  displayName?: string;
}

interface CodexPluginManifest {
  name?: unknown;
  interface?: {
    displayName?: unknown;
  };
}

async function isDirectory(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

function looksLikePluginCache(basePath: string): boolean {
  const segments = path.resolve(basePath).split(path.sep);
  return segments.at(-1) === 'cache' && segments.at(-2) === 'plugins';
}

function parseSemver(version: string): [number, number, number] | undefined {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(left: [number, number, number], right: [number, number, number]): number {
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

function isBetterPluginRoot(candidate: CodexPluginRoot, current: CodexPluginRoot): boolean {
  const candidateSemver = parseSemver(candidate.version);
  const currentSemver = parseSemver(current.version);
  if (candidateSemver && currentSemver) return compareSemver(candidateSemver, currentSemver) > 0;
  if (candidateSemver && !currentSemver) return true;
  if (!candidateSemver && currentSemver) return false;
  return candidate.mtimeMs > current.mtimeMs;
}

export class CodexProvider extends BaseProvider {
  readonly id = 'codex';
  readonly displayName = 'Codex';
  readonly basePaths: string[];
  readonly skillPaths: string[];
  readonly pluginCachePaths: string[];
  readonly configPath: string;
  readonly capabilities: ProviderCapabilities = {
    canToggle: true,
  };

  constructor(basePaths?: string[], configPath?: string) {
    super();
    this.basePaths = basePaths ?? [
      path.join(os.homedir(), '.codex', 'skills'),
      path.join(os.homedir(), '.codex', 'plugins', 'cache'),
    ];
    this.pluginCachePaths = this.basePaths.filter(looksLikePluginCache);
    this.skillPaths = this.basePaths.filter((basePath) => !looksLikePluginCache(basePath));
    this.configPath = configPath ?? path.join(os.homedir(), '.codex', 'config.toml');
  }

  override async scan(): Promise<Skill[]> {
    const flatSkills = await this.scanBasePaths(this.skillPaths);
    const hydratedFlatSkills = await Promise.all(flatSkills.map(async (skill) => {
      const configEnabled = await readCodexSkillConfigEnabled(this.configPath, path.join(skill.path, 'SKILL.md'));
      return {
        ...skill,
        enabled: skill.enabled && configEnabled !== false,
      };
    }));
    const pluginSkills = await this.scanPluginCache();
    return [...hydratedFlatSkills, ...pluginSkills];
  }

  override getScanPaths() {
    return [
      ...this.skillPaths.map((basePath) => ({
        path: basePath,
        kind: 'skill-root' as const,
        label: 'Codex skill root',
      })),
      ...this.pluginCachePaths.map((basePath) => ({
        path: basePath,
        kind: 'plugin-cache' as const,
        label: 'Codex plugin cache',
      })),
    ];
  }

  override getDisableStrategy(skill: Pick<Skill, 'name' | 'path' | 'enabled' | 'origin'>): { type: 'provider-config'; description: string } | undefined {
    if (skill.origin?.type === 'plugin') {
      if (skill.origin.identityStatus === 'mismatched') return undefined;
      return {
        type: 'provider-config',
        description: `Writes [plugins."${skill.origin.pluginId}"] in Codex config.toml for the owning plugin`,
      };
    }
    return {
      type: 'provider-config',
      description: 'Writes [[skills.config]] in Codex config.toml',
    };
  }

  override async setEnabled(skill: Pick<Skill, 'name' | 'path' | 'enabled' | 'origin'>, enabled: boolean): Promise<void> {
    if (skill.origin?.type === 'plugin') {
      if (skill.origin.identityStatus === 'mismatched') {
        throw new Error(`Cannot toggle Codex plugin "${skill.origin.pluginId}" because its manifest identity does not match its cache path`);
      }
      if (skill.origin.pluginEnabled === enabled) return;
      await writeCodexPluginEnabled(this.configPath, skill.origin.pluginId, enabled);
      return;
    }
    if (skill.enabled === enabled) return;
    await writeCodexSkillConfigEnabled(this.configPath, path.join(skill.path, 'SKILL.md'), enabled);
  }

  override async disable(name: string): Promise<void> {
    const skill = (await this.scan()).find((item) => item.name === name || path.basename(item.path).replace(/^\.disabled-/, '') === name);
    if (!skill) throw new Error(`Skill "${name}" not found in ${this.displayName}`);
    await this.setEnabled(skill, false);
  }

  override async enable(name: string): Promise<void> {
    const skill = (await this.scan()).find((item) => item.name === name || path.basename(item.path).replace(/^\.disabled-/, '') === name);
    if (!skill) throw new Error(`Skill "${name}" not found in ${this.displayName}`);
    await this.setEnabled(skill, true);
  }

  private async scanPluginCache(): Promise<Skill[]> {
    const pluginConfig = await readCodexPluginConfig(this.configPath);
    const pluginRoots = await this.selectPluginRoots(pluginConfig);
    const skills = await Promise.all(pluginRoots.map((pluginRoot) => this.scanPluginRoot(pluginRoot, pluginConfig)));
    return skills.flat();
  }

  private async selectPluginRoots(pluginConfig: Record<string, boolean | undefined>): Promise<CodexPluginRoot[]> {
    const candidates = await this.findPluginRoots();
    const configuredById = new Map<string, CodexPluginRoot>();
    const configuredIds = new Set(Object.keys(pluginConfig));

    for (const candidate of candidates) {
      if (!configuredIds.has(candidate.pluginId)) continue;
      const current = configuredById.get(candidate.pluginId);
      if (!current || isBetterPluginRoot(candidate, current)) configuredById.set(candidate.pluginId, candidate);
    }

    const selected = [...configuredById.values()];
    const selectedPluginNames = new Set(selected.map((root) => root.pluginName));
    const unconfiguredByName = new Map<string, CodexPluginRoot>();

    for (const candidate of candidates) {
      if (configuredIds.has(candidate.pluginId)) continue;
      if (selectedPluginNames.has(candidate.pluginName)) continue;
      const current = unconfiguredByName.get(candidate.pluginName);
      if (!current || isBetterPluginRoot(candidate, current)) unconfiguredByName.set(candidate.pluginName, candidate);
    }

    return [...selected, ...unconfiguredByName.values()];
  }

  private async findPluginRoots(): Promise<CodexPluginRoot[]> {
    const roots: CodexPluginRoot[] = [];
    for (const cachePath of this.pluginCachePaths) {
      try { await access(cachePath); } catch { continue; }
      const marketplaces = await readdir(cachePath, { withFileTypes: true });
      for (const marketplace of marketplaces) {
        if (!marketplace.isDirectory()) continue;
        const marketplacePath = path.join(cachePath, marketplace.name);
        const plugins = await readdir(marketplacePath, { withFileTypes: true });
        for (const plugin of plugins) {
          if (!plugin.isDirectory()) continue;
          const pluginPath = path.join(marketplacePath, plugin.name);
          const versions = await readdir(pluginPath, { withFileTypes: true });
          for (const version of versions) {
            if (!version.isDirectory()) continue;
            const rootPath = path.join(pluginPath, version.name);
            const manifestPath = path.join(rootPath, '.codex-plugin', 'plugin.json');
            const skillsPath = path.join(rootPath, 'skills');
            if (!(await isDirectory(skillsPath))) continue;
            const manifest = await this.readPluginManifest(manifestPath);
            const rootStat = await stat(rootPath);
            roots.push({
              marketplace: marketplace.name,
              pluginName: plugin.name,
              pluginId: `${plugin.name}@${marketplace.name}`,
              version: version.name,
              path: rootPath,
              mtimeMs: rootStat.mtimeMs,
              manifestName: typeof manifest?.name === 'string' ? manifest.name : undefined,
              displayName: typeof manifest?.interface?.displayName === 'string' ? manifest.interface.displayName : undefined,
            });
          }
        }
      }
    }
    return roots;
  }

  private async readPluginManifest(manifestPath: string): Promise<CodexPluginManifest | undefined> {
    try {
      return JSON.parse(await readFile(manifestPath, 'utf-8')) as CodexPluginManifest;
    } catch {
      return undefined;
    }
  }

  private async scanPluginRoot(pluginRoot: CodexPluginRoot, pluginConfig: Record<string, boolean | undefined>): Promise<Skill[]> {
    const skills: Skill[] = [];
    const skillsPath = path.join(pluginRoot.path, 'skills');
    const pluginEnabled = pluginConfig[pluginRoot.pluginId] !== false;
    const identityStatus = pluginRoot.manifestName && pluginRoot.manifestName !== pluginRoot.pluginName ? 'mismatched' : 'confirmed';
    const entries = await readdir(skillsPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
      const skillPath = path.join(skillsPath, entry.name);
      const skillMdPath = path.join(skillPath, 'SKILL.md');
      try {
        const content = await readFile(skillMdPath, 'utf-8');
        const parsed = parseSkillMd(content);
        const resolved = await realpath(skillPath);
        const dirStat = await stat(resolved);
        const skillConfigEnabled = await readCodexSkillConfigEnabled(this.configPath, skillMdPath);
        skills.push({
          name: parsed.name || entry.name,
          description: parsed.description,
          provider: this.id,
          path: skillPath,
          resolvedPath: resolved !== skillPath ? resolved : undefined,
          version: pluginRoot.version,
          enabled: pluginEnabled && skillConfigEnabled !== false,
          scope: 'global',
          metadata: { license: parsed.metadata.license, author: parsed.metadata.author, tags: parsed.metadata.tags },
          origin: {
            type: 'plugin',
            pluginId: pluginRoot.pluginId,
            pluginName: pluginRoot.pluginName,
            marketplace: pluginRoot.marketplace,
            version: pluginRoot.version,
            displayName: pluginRoot.displayName,
            pluginEnabled,
            skillConfigEnabled,
            identityStatus,
          },
          source: { type: 'local', createdAt: dirStat.birthtime.toISOString() },
          scanIssues: identityStatus === 'mismatched' ? [{
            code: 'plugin-identity-mismatch',
            message: `Codex plugin manifest name "${pluginRoot.manifestName}" does not match cache plugin "${pluginRoot.pluginName}"`,
          }] : undefined,
        });
      } catch { /* skip invalid plugin skills for now */ }
    }

    return skills;
  }
}
