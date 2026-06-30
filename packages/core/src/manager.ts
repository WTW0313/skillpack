import { readdir, readFile, access, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { ISkillProvider } from './providers/provider.js';
import type { IInstallSource } from './sources/source.js';
import type { Skill } from './models/index.js';
import type { DuplicateInfo } from './models/duplicate.js';
import type { RemoteSkill, UpdateInfo } from './models/source.js';
import type { SkillGroup, SkillInventoryInstance } from './models/inventory.js';
import { DuplicateDetector } from './duplicates.js';
import { LockfileManager } from './lockfile.js';
import { SkillsLockReader } from './skills-lock.js';
import { parseSkillMd } from './parser.js';
import { buildSkillInventory } from './models/inventory.js';

export class SkillManager {
  private providers = new Map<string, ISkillProvider>();
  private sources = new Map<string, IInstallSource>();
  private skills: Skill[] = [];
  private projectSkills: Skill[] = [];
  private duplicates: DuplicateInfo[] = [];
  private duplicateDetector = new DuplicateDetector();
  private globalLock?: LockfileManager;
  private skillsLock = new SkillsLockReader();
  private globalSkillsDir = path.join(os.homedir(), '.agents', 'skills');

  registerProvider(provider: ISkillProvider): void { this.providers.set(provider.id, provider); }
  registerSource(source: IInstallSource): void { this.sources.set(source.id, source); }
  getProvider(id: string): ISkillProvider | undefined { return this.providers.get(id); }
  getProviders(): ISkillProvider[] { return [...this.providers.values()]; }
  getSources(): IInstallSource[] { return [...this.sources.values()]; }

  async init(configDir?: string): Promise<void> {
    const lockPath = path.join(configDir ?? path.join(os.homedir(), '.config', 'skillpack'), 'skillpack.lock');
    this.globalLock = new LockfileManager(lockPath);
    await Promise.all([
      this.globalLock.load(),
      this.skillsLock.load(),
    ]);
  }

  async scanAll(cwd?: string, projectSkillsDirs?: string[]): Promise<void> {
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
    const hydratedBySkillsLock = new Set<string>();

    // Pass 1: hydrate skills whose real path lives under ~/.agents/skills/ from .skill-lock.json
    for (const skill of allSkills) {
      const realPath = skill.resolvedPath ?? skill.path;
      if (!realPath.startsWith(this.globalSkillsDir + path.sep)) continue;
      const entry = skillsLockEntries[skill.name];
      if (!entry) continue;
      hydratedBySkillsLock.add(skill.name);
      skill.source = {
        ...skill.source,
        type: 'skillssh',
        repo: entry.source,
        skillFolderHash: entry.skillFolderHash,
        installedAt: entry.installedAt,
      };
    }

    // Pass 2: hydrate remaining skills from skillpack.lock (GitHub installs)
    if (this.globalLock) {
      const lockEntries = this.globalLock.getEntries();
      const scannedNames = new Set(allSkills.map((s) => s.name));
      let pruned = false;

      for (const skill of allSkills) {
        if (hydratedBySkillsLock.has(skill.name)) continue;
        const lockEntry = lockEntries[skill.name];
        if (!lockEntry || lockEntry.source !== 'github') continue;
        skill.source = {
          ...skill.source,
          type: 'github',
          repo: lockEntry.repo ?? lockEntry.identifier,
          ref: lockEntry.ref ?? skill.source?.ref,
          commit: lockEntry.commit ?? skill.source?.commit,
          installedAt: lockEntry.installedAt,
        };
      }

      // Prune stale entries from skillpack.lock
      for (const name of Object.keys(lockEntries)) {
        if (!scannedNames.has(name)) {
          this.globalLock.removeEntry(name);
          pruned = true;
        }
      }
      // Remove skillssh entries that should no longer be tracked by skillpack.lock
      for (const name of Object.keys(lockEntries)) {
        if (lockEntries[name].source === 'skillssh') {
          this.globalLock.removeEntry(name);
          pruned = true;
        }
      }
      if (pruned) await this.globalLock.save();
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
    if (skill.source?.type === 'skillssh') {
      const source = this.sources.get('skillssh') as import('./sources/skillssh.js').SkillsShSource | undefined;
      if (source) {
        await source.removeViaCli(skill.name);
      } else {
        await rm(skill.path, { recursive: true, force: true });
      }
      return;
    }

    if (skill.source?.type === 'github') {
      await rm(skill.path, { recursive: true, force: true });
      this.globalLock?.removeEntry(skill.name);
      await this.globalLock?.save();
      return;
    }

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

    if (this.globalLock && sourceId === 'github') {
      this.globalLock.setEntry(result.skillName, {
        source: 'github',
        identifier,
        repo: identifier.replace(/@.*$/, ''),
        ref: result.ref,
        commit: result.commit,
        installedAt: new Date().toISOString(),
        integrity: '',
      });
      await this.globalLock.save();
    }
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
      throw new Error('Cannot update a locally-created skill');
    }

    if (skill.source.type === 'skillssh') {
      const source = this.sources.get('skillssh') as import('./sources/skillssh.js').SkillsShSource | undefined;
      if (!source) throw new Error('skills.sh source not registered');
      await source.updateViaCli(skill.name);
      return;
    }

    const lockEntry = this.globalLock?.getEntry(skill.name);
    const identifier = lockEntry?.identifier ?? skill.source.repo ?? skill.name;
    await this.uninstallSkill(skill);
    await this.installFromSource('github', identifier, skill.provider);
  }
}
