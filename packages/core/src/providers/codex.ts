import { BaseProvider, type ProviderCapabilities } from './provider.js';
import type { Skill, SkillTemplate } from '../models/index.js';
import type { InstallRequest } from '../models/source.js';
import { generateSkillMd } from '../parser.js';
import { mkdir, writeFile, rm, cp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export class CodexProvider extends BaseProvider {
  readonly id = 'codex';
  readonly displayName = 'Codex';
  readonly basePaths: string[];
  readonly capabilities: ProviderCapabilities = {
    canInstall: true, canUninstall: true, canUpdate: true, canToggle: false, canCreate: true,
  };

  constructor(basePaths?: string[]) {
    super();
    this.basePaths = basePaths ?? [path.join(os.homedir(), '.codex', 'skills')];
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
      provider: this.id, path: skillDir, enabled: true, scope: 'global', readonly: false,
      metadata: template.metadata ?? {},
      source: { type: 'local', createdAt: new Date().toISOString() },
    };
  }
}
