import { readdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { ISkillProvider } from './providers/provider.js';
import type { IInstallSource } from './sources/source.js';
import type { ScanPathDiagnostic, Skill } from './models/index.js';
import type { DuplicateInfo } from './models/duplicate.js';
import type { RemoteSkill, UpdateInfo } from './models/source.js';
import type { SkillGroup, SkillInventoryInstance } from './models/inventory.js';
import { DuplicateDetector } from './duplicates.js';
import { SkillsLockReader } from './skills-lock.js';
import { parseSkillMd } from './parser.js';
import { buildSkillInventory } from './models/inventory.js';

export class SkillManager {
  private providers = new Map<string, ISkillProvider>();
  private sources = new Map<string, IInstallSource>();
  private skills: Skill[] = [];
  private projectSkills: Skill[] = [];
  private scanPathDiagnostics: ScanPathDiagnostic[] = [];
  private duplicates: DuplicateInfo[] = [];
  private duplicateDetector = new DuplicateDetector();
  private skillsLock = new SkillsLockReader();
  private globalSkillsDir = path.join(os.homedir(), '.agents', 'skills');

  registerProvider(provider: ISkillProvider): void { this.providers.set(provider.id, provider); }
  registerSource(source: IInstallSource): void { this.sources.set(source.id, source); }
  getProvider(id: string): ISkillProvider | undefined { return this.providers.get(id); }
  getProviders(): ISkillProvider[] { return [...this.providers.values()]; }
  getSources(): IInstallSource[] { return [...this.sources.values()]; }

  async init(_configDir?: string): Promise<void> {
    await this.skillsLock.load();
  }

  async scanAll(cwd?: string, projectSkillsDirs?: string[]): Promise<void> {
    this.scanPathDiagnostics = await this.collectScanPathDiagnostics(cwd, projectSkillsDirs);
    const results = await Promise.all([...this.providers.values()].map((p) => p.scan()));
    let allSkills = results.flat();

    if (cwd && projectSkillsDirs?.length) {
      const projectSkills = await this.scanProjectSkills(cwd, projectSkillsDirs);
      allSkills = [...allSkills, ...projectSkills];
      this.projectSkills = projectSkills;
    } else {
      this.projectSkills = [];
    }

    await this.skillsLock.load();

    const skillsLockEntries = this.skillsLock.getEntries();
    for (const skill of allSkills) {
      const realPath = skill.resolvedPath ?? skill.path;
      if (!realPath.startsWith(this.globalSkillsDir + path.sep)) continue;
      const entry = skillsLockEntries[skill.name];
      if (!entry) continue;
      skill.source = {
        ...skill.source,
        type: 'skillssh',
        repo: entry.source,
        skillFolderHash: entry.skillFolderHash,
        installedAt: entry.installedAt,
      };
    }

    this.skills = allSkills;
    this.duplicates = this.duplicateDetector.detect(this.skills);
  }

  async scanProjectSkills(cwd: string, projectSkillsDirs: string[]): Promise<Skill[]> {
    const skills: Skill[] = [];
    const seen = new Set<string>();
    for (const dir of projectSkillsDirs) {
      const projectPath = resolveProjectSkillsPath(cwd, dir);
      try { await access(projectPath); } catch { continue; }
      const entries = await readdir(projectPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        if (seen.has(entry.name)) continue;
        const skillDir = path.join(projectPath, entry.name);
        const skillMdPath = path.join(skillDir, 'SKILL.md');
        try {
          const content = await readFile(skillMdPath, 'utf-8');
          try {
            const parsed = parseSkillMd(content);
            const name = parsed.name || entry.name;
            if (seen.has(name)) continue;
            seen.add(name);
            skills.push({
              name,
              description: parsed.description,
              provider: 'project',
              path: skillDir,
              version: parsed.raw.version as string | undefined,
              enabled: true,
              scope: 'project',
              metadata: { license: parsed.metadata.license, author: parsed.metadata.author, tags: parsed.metadata.tags },
              source: { type: 'local' },
            });
          } catch (err) {
            if (seen.has(entry.name)) continue;
            seen.add(entry.name);
            skills.push({
              name: entry.name,
              description: '',
              provider: 'project',
              path: skillDir,
              enabled: true,
              scope: 'project',
              metadata: {},
              source: { type: 'local' },
              scanIssues: [{
                code: 'invalid-skill-md',
                message: err instanceof Error ? err.message : 'Invalid SKILL.md',
              }],
            });
          }
        } catch { /* skip missing SKILL.md */ }
      }
    }
    return skills;
  }

  getAllSkills(): Skill[] { return this.skills; }
  getScanPathDiagnostics(): ScanPathDiagnostic[] { return this.scanPathDiagnostics; }
  getInventory(): SkillGroup[] {
    return buildSkillInventory(this.skills, {
      getDisableStrategy: (skill) => this.providers.get(skill.provider)?.getDisableStrategy(skill),
    });
  }
  getProjectSkills(): SkillInventoryInstance[] {
    return this.projectSkills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      provider: skill.provider,
      path: skill.path,
      resolvedPath: skill.resolvedPath,
      version: skill.version,
      enabled: skill.enabled,
      source: skill.source,
      actions: [],
      healthSignals: (skill.scanIssues ?? []).map((issue) => ({
        code: issue.code,
        message: issue.message,
      })),
    }));
  }
  getSkillsByProvider(providerId: string): Skill[] { return this.skills.filter((s) => s.provider === providerId); }
  getDuplicates(): DuplicateInfo[] { return this.duplicates; }
  isDuplicate(skillName: string): boolean { return this.duplicates.some((d) => d.skillName === skillName); }

  async toggleSkill(skill: Skill): Promise<void> {
    const provider = this.providers.get(skill.provider);
    if (!provider) throw new Error(`Provider not found: ${skill.provider}`);
    if (!provider.capabilities.canToggle) {
      throw new Error(`${provider.displayName} does not support toggle`);
    }
    await provider.setEnabled(skill, !skill.enabled);
  }

  async toggleInventoryInstance(instance: SkillInventoryInstance): Promise<void> {
    const provider = this.providers.get(instance.provider);
    if (!provider) throw new Error(`Provider not found: ${instance.provider}`);
    if (!provider.capabilities.canToggle) {
      throw new Error(`${provider.displayName} does not support toggle`);
    }
    await provider.setEnabled(instance, !instance.enabled);
  }

  async uninstallSkill(skill: Skill): Promise<void> {
    if (skill.provider === 'global' && skill.source?.type === 'skillssh') {
      const source = this.sources.get('skillssh') as import('./sources/skillssh.js').SkillsShSource | undefined;
      if (!source) throw new Error('skills.sh source not registered');
      await source.removeViaCli(skill.name);
      return;
    }

    throw new Error('Only skills.sh-managed Global Skills can be removed');
  }

  async searchRemote(sourceId: string, query: string): Promise<RemoteSkill[]> {
    const source = this.sources.get(sourceId);
    if (!source) throw new Error(`Source not found: ${sourceId}`);
    return source.search(query);
  }

  async installFromSource(sourceId: string, identifier: string, providerId: string): Promise<void> {
    if (sourceId !== 'skillssh' || providerId !== 'global') {
      throw new Error('Only skills.sh installs into Global Skills are supported');
    }

    const source = this.sources.get(sourceId);
    if (!source) throw new Error(`Source not found: ${sourceId}`);
    if (!this.providers.has(providerId)) throw new Error(`Provider not found: ${providerId}`);

    await source.fetch(identifier);
    await this.scanAll();
  }

  async checkUpdates(): Promise<Array<{ skill: Skill; update: UpdateInfo }>> {
    const updates: Array<{ skill: Skill; update: UpdateInfo }> = [];
    for (const skill of this.skills) {
      const update = await this.checkSkillUpdate(skill);
      if (update) updates.push({ skill, update });
    }
    return updates;
  }

  async checkSkillUpdate(skill: Skill): Promise<UpdateInfo | null> {
    if (!skill.source || skill.source.type === 'local') return null;
    for (const source of this.sources.values()) {
      const update = await source.checkUpdate(skill);
      if (update?.hasUpdate) return update;
    }
    return null;
  }

  async updateSkill(skill: Skill): Promise<void> {
    if (!skill.source || skill.source.type === 'local') {
      throw new Error('Cannot update an unmanaged on-disk skill');
    }

    if (skill.source.type !== 'skillssh') {
      throw new Error('Only skills.sh-managed Global Skills can be updated');
    }

    const source = this.sources.get('skillssh') as import('./sources/skillssh.js').SkillsShSource | undefined;
    if (!source) throw new Error('skills.sh source not registered');
    await source.updateViaCli(skill.name);
  }

  private async collectScanPathDiagnostics(cwd?: string, projectSkillsDirs?: string[]): Promise<ScanPathDiagnostic[]> {
    const providerDiagnostics = await Promise.all(
      [...this.providers.values()].flatMap((provider) => provider.getScanPaths().map(async (scanPath) => ({
        scope: 'provider' as const,
        provider: provider.id,
        path: scanPath.path,
        exists: await pathExists(scanPath.path),
        kind: scanPath.kind,
        label: scanPath.label,
      }))),
    );

    const projectDiagnostics = cwd && projectSkillsDirs?.length
      ? await Promise.all(projectSkillsDirs.map(async (dir) => {
        const projectPath = resolveProjectSkillsPath(cwd, dir);
        return {
          scope: 'project' as const,
          path: projectPath,
          exists: await pathExists(projectPath),
          kind: 'project-root' as const,
          label: 'Project Skills root',
        };
      }))
      : [];

    return [...providerDiagnostics, ...projectDiagnostics];
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function resolveProjectSkillsPath(cwd: string, dir: string): string {
  return path.isAbsolute(dir) ? dir : path.join(cwd, dir);
}
