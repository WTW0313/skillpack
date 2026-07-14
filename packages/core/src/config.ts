import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export interface ProviderConfig {
  enabled: boolean;
  paths: string[];
}

export interface SourceConfig {
  enabled: boolean;
}

export interface UsageConfig {
  importConsent: boolean;
  artifactRoots: Record<string, string[]>;
}

export interface SkillpackConfig {
  editor: string;
  autoCheckUpdates: boolean;
  projectSkillsDirs: string[];
  providers: Record<string, ProviderConfig>;
  sources: Record<string, SourceConfig>;
  usage: UsageConfig;
}

type PartialSkillpackConfig = Partial<Omit<SkillpackConfig, 'providers' | 'sources'>> & {
  providers?: Record<string, Partial<ProviderConfig>>;
  sources?: Record<string, Partial<SourceConfig>>;
  usage?: Partial<UsageConfig>;
};

export interface ConfigManagerOptions {
  configDir?: string;
  homeDir?: string;
}

export function createDefaultConfig(homeDir = os.homedir()): SkillpackConfig {
  return {
    editor: process.env.EDITOR || 'vi',
    autoCheckUpdates: false,
    projectSkillsDirs: ['.codex/skills', '.claude/skills', '.agents/skills'],
    providers: {
      codex: {
        enabled: true,
        paths: [path.join(homeDir, '.codex', 'skills'), path.join(homeDir, '.codex', 'plugins', 'cache')],
      },
      claude: {
        enabled: true,
        paths: [path.join(homeDir, '.claude', 'plugins', 'cache'), path.join(homeDir, '.claude', 'skills')],
      },
      global: { enabled: true, paths: [path.join(homeDir, '.agents', 'skills')] },
    },
    sources: {
      skillssh: { enabled: true },
    },
    usage: {
      importConsent: false,
      artifactRoots: {
        codex: [path.join(homeDir, '.codex', 'sessions'), path.join(homeDir, '.codex', 'archived_sessions')],
        claude: [path.join(homeDir, '.claude', 'projects')],
      },
    },
  };
}

export class ConfigManager {
  private configPath: string;
  private defaultConfig: SkillpackConfig;
  private config: SkillpackConfig;

  constructor(configDirOrOptions?: string | ConfigManagerOptions) {
    const options =
      typeof configDirOrOptions === 'string' ? { configDir: configDirOrOptions } : (configDirOrOptions ?? {});
    const homeDir = options.homeDir ?? os.homedir();
    this.defaultConfig = createDefaultConfig(homeDir);
    this.config = cloneConfig(this.defaultConfig);
    const dir = options.configDir ?? path.join(homeDir, '.config', 'skillpack');
    this.configPath = path.join(dir, 'config.json');
  }

  async load(): Promise<SkillpackConfig> {
    try {
      const raw = await readFile(this.configPath, 'utf-8');
      this.config = mergeConfig(this.defaultConfig, JSON.parse(raw) as PartialSkillpackConfig);
    } catch {
      this.config = cloneConfig(this.defaultConfig);
      await this.autoDetectProviders();
    }
    return this.config;
  }

  async save(): Promise<void> {
    await mkdir(path.dirname(this.configPath), { recursive: true });
    await writeFile(this.configPath, JSON.stringify(this.config, null, 2) + '\n', 'utf-8');
  }

  getConfig(): SkillpackConfig {
    return this.config;
  }

  async setUsageImportConsent(importConsent: boolean): Promise<SkillpackConfig> {
    this.config.usage.importConsent = importConsent;
    await this.save();
    return this.config;
  }

  private async autoDetectProviders(): Promise<void> {
    for (const [id, provider] of Object.entries(this.config.providers)) {
      let found = false;
      for (const p of provider.paths) {
        try {
          await access(p);
          found = true;
          break;
        } catch {
          /* not found */
        }
      }
      this.config.providers[id].enabled = found;
    }
  }
}

function cloneConfig(config: SkillpackConfig): SkillpackConfig {
  return {
    editor: config.editor,
    autoCheckUpdates: config.autoCheckUpdates,
    projectSkillsDirs: [...config.projectSkillsDirs],
    providers: Object.fromEntries(
      Object.entries(config.providers).map(([id, provider]) => [
        id,
        { enabled: provider.enabled, paths: [...provider.paths] },
      ]),
    ),
    sources: Object.fromEntries(
      Object.entries(config.sources).map(([id, source]) => [id, { enabled: source.enabled }]),
    ),
    usage: {
      importConsent: config.usage.importConsent,
      artifactRoots: Object.fromEntries(
        Object.entries(config.usage.artifactRoots).map(([id, roots]) => [id, [...roots]]),
      ),
    },
  };
}

function mergeConfig(defaultConfig: SkillpackConfig, userConfig: PartialSkillpackConfig): SkillpackConfig {
  const config = cloneConfig(defaultConfig);

  if (userConfig.editor !== undefined) config.editor = userConfig.editor;
  if (userConfig.autoCheckUpdates !== undefined) config.autoCheckUpdates = userConfig.autoCheckUpdates;
  if (userConfig.projectSkillsDirs !== undefined) config.projectSkillsDirs = [...userConfig.projectSkillsDirs];

  for (const [id, override] of Object.entries(userConfig.providers ?? {})) {
    const base = config.providers[id] ?? { enabled: true, paths: [] };
    config.providers[id] = {
      enabled: override.enabled ?? base.enabled,
      paths: override.paths ? [...override.paths] : [...base.paths],
    };
  }

  for (const [id, override] of Object.entries(userConfig.sources ?? {})) {
    const base = config.sources[id] ?? { enabled: true };
    config.sources[id] = {
      enabled: override.enabled ?? base.enabled,
    };
  }

  if (userConfig.usage !== undefined) {
    config.usage = {
      importConsent: userConfig.usage.importConsent ?? config.usage.importConsent,
      artifactRoots: {
        ...config.usage.artifactRoots,
        ...Object.fromEntries(
          Object.entries(userConfig.usage.artifactRoots ?? {}).map(([id, roots]) => [id, [...roots]]),
        ),
      },
    };
  }

  return config;
}
