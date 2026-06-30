import { BaseProvider, type ProviderCapabilities } from './provider.js';
import type { Skill, SkillTemplate } from '../models/index.js';
import type { InstallRequest } from '../models/source.js';
import { generateSkillMd } from '../parser.js';
import { readCodexSkillConfigEnabled, writeCodexSkillConfigEnabled } from './provider-settings.js';
import { mkdir, writeFile, rm, cp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export class CodexProvider extends BaseProvider {
  readonly id = 'codex';
  readonly displayName = 'Codex';
  readonly basePaths: string[];
  readonly configPath: string;
  readonly capabilities: ProviderCapabilities = {
    canInstall: true, canUninstall: true, canUpdate: true, canToggle: true, canCreate: true,
  };

  constructor(basePaths?: string[], configPath?: string) {
    super();
    this.basePaths = basePaths ?? [path.join(os.homedir(), '.codex', 'skills')];
    this.configPath = configPath ?? path.join(os.homedir(), '.codex', 'config.toml');
  }

  override async scan(): Promise<Skill[]> {
    const skills = await super.scan();
    return Promise.all(skills.map(async (skill) => {
      const configEnabled = await readCodexSkillConfigEnabled(this.configPath, path.join(skill.path, 'SKILL.md'));
      return {
        ...skill,
        enabled: skill.enabled && configEnabled !== false,
      };
    }));
  }

  override getDisableStrategy(): { type: 'provider-config'; description: string } {
    return {
      type: 'provider-config',
      description: 'Writes [[skills.config]] in Codex config.toml',
    };
  }

  override async setEnabled(skill: Pick<Skill, 'name' | 'path' | 'enabled'>, enabled: boolean): Promise<void> {
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

  override async install(name: string, request: InstallRequest): Promise<void> {
    const dest = path.join(this.basePaths[0], name);
    await cp(request.tempDir, dest, { recursive: true });
  }

  override async uninstall(name: string): Promise<void> {
    await rm(path.join(this.basePaths[0], name), { recursive: true, force: true });
  }

  override async create(template: SkillTemplate): Promise<Skill> {
    const skillDir = path.join(this.basePaths[0], template.name);
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), generateSkillMd(template), 'utf-8');
    return {
      name: template.name, description: template.description,
      provider: this.id, path: skillDir, enabled: true, scope: 'global',
      metadata: template.metadata ?? {},
      source: { type: 'local', createdAt: new Date().toISOString() },
    };
  }
}
