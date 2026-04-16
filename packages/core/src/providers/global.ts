import { BaseProvider, type ProviderCapabilities } from './provider.js';
import type { Skill, SkillTemplate } from '../models/index.js';
import { generateSkillMd } from '../parser.js';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export class GlobalProvider extends BaseProvider {
  readonly id = 'global';
  readonly displayName = 'Global';
  readonly basePaths: string[];
  readonly capabilities: ProviderCapabilities = {
    canInstall: true, canUninstall: true, canUpdate: true, canToggle: true, canCreate: true,
  };
  constructor(basePaths?: string[]) {
    super();
    this.basePaths = basePaths ?? [path.join(os.homedir(), '.agents', 'skills')];
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
