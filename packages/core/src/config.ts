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

export interface SkillpackConfig {
  editor: string;
  autoCheckUpdates: boolean;
  projectSkillsDir: string;
  providers: Record<string, ProviderConfig>;
  sources: Record<string, SourceConfig>;
}

const DEFAULT_CONFIG: SkillpackConfig = {
  editor: process.env.EDITOR || 'vi',
  autoCheckUpdates: true,
  projectSkillsDir: '.skillpack/skills',
  providers: {
    codex: { enabled: true, paths: [path.join(os.homedir(), '.codex', 'skills')] },
    cursor: { enabled: true, paths: [path.join(os.homedir(), '.cursor', 'skills-cursor')] },
    claude: { enabled: true, paths: [path.join(os.homedir(), '.claude', 'plugins', 'cache')] },
    skillssh: { enabled: true, paths: [path.join(os.homedir(), '.agents', 'skills')] },
  },
  sources: {
    github: { enabled: true },
    skillssh: { enabled: true },
  },
};

export class ConfigManager {
  private configPath: string;
  private config: SkillpackConfig = { ...DEFAULT_CONFIG };

  constructor(configDir?: string) {
    const dir = configDir ?? path.join(os.homedir(), '.config', 'skillpack');
    this.configPath = path.join(dir, 'config.json');
  }

  async load(): Promise<SkillpackConfig> {
    try {
      const raw = await readFile(this.configPath, 'utf-8');
      this.config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch {
      this.config = { ...DEFAULT_CONFIG };
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

  private async autoDetectProviders(): Promise<void> {
    for (const [id, provider] of Object.entries(this.config.providers)) {
      let found = false;
      for (const p of provider.paths) {
        try {
          await access(p);
          found = true;
          break;
        } catch { /* not found */ }
      }
      this.config.providers[id].enabled = found;
    }
  }
}
