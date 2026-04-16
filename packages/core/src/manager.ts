import { cp, readdir, readFile, access, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { ISkillProvider } from './providers/provider.js';
import type { IInstallSource } from './sources/source.js';
import type { Skill, SkillTemplate } from './models/index.js';
import type { DuplicateInfo } from './models/duplicate.js';
import type { RemoteSkill, UpdateInfo } from './models/source.js';
import { DuplicateDetector } from './duplicates.js';
import { LockfileManager } from './lockfile.js';
import { parseSkillMd } from './parser.js';

export class SkillManager {
  private providers = new Map<string, ISkillProvider>();
  private sources = new Map<string, IInstallSource>();
  private skills: Skill[] = [];
  private duplicates: DuplicateInfo[] = [];
  private duplicateDetector = new DuplicateDetector();
  private globalLock?: LockfileManager;

  registerProvider(provider: ISkillProvider): void { this.providers.set(provider.id, provider); }
  registerSource(source: IInstallSource): void { this.sources.set(source.id, source); }
  getProvider(id: string): ISkillProvider | undefined { return this.providers.get(id); }
  getProviders(): ISkillProvider[] { return [...this.providers.values()]; }
  getSources(): IInstallSource[] { return [...this.sources.values()]; }

  async init(configDir?: string): Promise<void> {
    const lockPath = path.join(configDir ?? path.join(os.homedir(), '.config', 'skillpack'), 'skillpack.lock');
    this.globalLock = new LockfileManager(lockPath);
    await this.globalLock.load();
  }

  async scanAll(cwd?: string, projectSkillsDirs?: string[]): Promise<void> {
    const results = await Promise.all([...this.providers.values()].map((p) => p.scan()));
    let allSkills = results.flat();

    if (cwd && projectSkillsDirs?.length) {
      const projectSkills = await this.scanProjectSkills(cwd, projectSkillsDirs);
      const projectNames = new Set(projectSkills.map((s) => s.name));
      allSkills = allSkills.filter((s) => !projectNames.has(s.name));
      allSkills = [...allSkills, ...projectSkills];
    }

    if (this.globalLock) {
      const entries = this.globalLock.getEntries();
      for (const skill of allSkills) {
        const lockEntry = entries[skill.name];
        if (lockEntry) {
          skill.source = {
            ...skill.source,
            type: (lockEntry.source as 'github' | 'skillssh') || skill.source?.type || 'local',
            repo: lockEntry.repo ?? lockEntry.identifier,
            installedAt: lockEntry.installedAt,
          };
        }
      }
    }

    this.skills = allSkills;
    this.duplicates = this.duplicateDetector.detect(this.skills);
  }

  async scanProjectSkills(cwd: string, projectSkillsDirs: string[]): Promise<Skill[]> {
    const skills: Skill[] = [];
    const seen = new Set<string>();
    for (const dir of projectSkillsDirs) {
      const projectPath = path.join(cwd, dir);
      try { await access(projectPath); } catch { continue; }
      const entries = await readdir(projectPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        if (seen.has(entry.name)) continue;
        const skillDir = path.join(projectPath, entry.name);
        const skillMdPath = path.join(skillDir, 'SKILL.md');
        try {
          const content = await readFile(skillMdPath, 'utf-8');
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
        } catch { /* skip */ }
      }
    }
    return skills;
  }

  getAllSkills(): Skill[] { return this.skills; }
  getSkillsByProvider(providerId: string): Skill[] { return this.skills.filter((s) => s.provider === providerId); }
  getDuplicates(): DuplicateInfo[] { return this.duplicates; }
  isDuplicate(skillName: string): boolean { return this.duplicates.some((d) => d.skillName === skillName); }

  async createSkill(providerId: string, template: SkillTemplate): Promise<Skill> {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Provider not found: ${providerId}`);
    if (!provider.capabilities.canCreate) throw new Error(`Provider ${providerId} does not support creating skills`);
    return provider.create(template);
  }

  async toggleSkill(skill: Skill): Promise<void> {
    const provider = this.providers.get(skill.provider);
    if (!provider) throw new Error(`Provider not found: ${skill.provider}`);
    if (!provider.capabilities.canToggle) {
      throw new Error(`${provider.displayName} does not support toggle`);
    }
    const dirName = path.basename(skill.path).replace(/^\.disabled-/, '');
    if (skill.enabled) {
      await provider.disable(dirName);
    } else {
      await provider.enable(dirName);
    }
  }

  async uninstallSkill(skill: Skill): Promise<void> {
    const provider = this.providers.get(skill.provider);
    if (provider?.capabilities.canUninstall) {
      await provider.uninstall(path.basename(skill.path));
    } else {
      await rm(skill.path, { recursive: true, force: true });
    }
  }

  async searchRemote(sourceId: string, query: string): Promise<RemoteSkill[]> {
    const source = this.sources.get(sourceId);
    if (!source) throw new Error(`Source not found: ${sourceId}`);
    return source.search(query);
  }

  async forkToLocal(skill: Skill, targetProviderId: string): Promise<Skill> {
    const provider = this.providers.get(targetProviderId);
    if (!provider) throw new Error(`Provider not found: ${targetProviderId}`);
    if (!provider.capabilities.canCreate) {
      throw new Error(`Provider ${targetProviderId} does not support creating skills`);
    }
    const destDir = path.join(provider.basePaths[0], skill.name);
    await cp(skill.path, destDir, { recursive: true });
    return {
      ...skill,
      provider: targetProviderId,
      path: destDir,
      source: {
        type: 'local',
        createdAt: new Date().toISOString(),
        forkedFrom: skill.source?.type !== 'local'
          ? { source: skill.source!.type as 'github' | 'skillssh', identifier: skill.source!.repo ?? skill.name }
          : undefined,
      },
    };
  }

  async installFromSource(sourceId: string, identifier: string, providerId: string): Promise<void> {
    const source = this.sources.get(sourceId);
    if (!source) throw new Error(`Source not found: ${sourceId}`);
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Provider not found: ${providerId}`);
    const result = await source.fetch(identifier);

    if (sourceId === 'skillssh' && providerId === 'global') {
      // npx skills add already placed it in ~/.agents/skills/, just rescan
      await this.scanAll();
    } else if (sourceId === 'skillssh') {
      // Installed to ~/.agents/skills/ by npx, but user wants it in a different provider.
      // Find the newly installed skill and copy it to the target.
      const globalProvider = this.providers.get('global');
      if (globalProvider) {
        const srcDir = path.join(globalProvider.basePaths[0], result.skillName);
        try {
          await access(srcDir);
          await provider.install(result.skillName, { sourceType: 'skillssh', identifier, tempDir: srcDir });
        } catch {
          // Fallback: skill name might differ from identifier, just rescan
        }
      }
      await this.scanAll();
    } else {
      await provider.install(result.skillName, { sourceType: sourceId as 'github' | 'skillssh', identifier, tempDir: result.tempDir });
      await this.scanAll();
    }

    if (this.globalLock) {
      this.globalLock.setEntry(result.skillName, {
        source: sourceId,
        identifier,
        installedAt: new Date().toISOString(),
        integrity: '',
      });
      await this.globalLock.save();
    }
  }

  async checkUpdates(): Promise<Array<{ skill: Skill; update: UpdateInfo }>> {
    const updates: Array<{ skill: Skill; update: UpdateInfo }> = [];
    for (const skill of this.skills) {
      if (!skill.source || skill.source.type === 'local') continue;
      for (const source of this.sources.values()) {
        const update = await source.checkUpdate(skill);
        if (update?.hasUpdate) { updates.push({ skill, update }); break; }
      }
    }
    return updates;
  }
}
