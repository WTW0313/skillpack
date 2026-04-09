import type { ISkillProvider } from './providers/provider.js';
import type { IInstallSource } from './sources/source.js';
import type { Skill, SkillTemplate } from './models/index.js';
import type { ConflictInfo } from './models/conflict.js';
import type { RemoteSkill, UpdateInfo } from './models/source.js';
import { ConflictDetector } from './conflicts.js';

export class SkillManager {
  private providers = new Map<string, ISkillProvider>();
  private sources = new Map<string, IInstallSource>();
  private skills: Skill[] = [];
  private conflicts: ConflictInfo[] = [];
  private conflictDetector = new ConflictDetector();

  registerProvider(provider: ISkillProvider): void { this.providers.set(provider.id, provider); }
  registerSource(source: IInstallSource): void { this.sources.set(source.id, source); }
  getProvider(id: string): ISkillProvider | undefined { return this.providers.get(id); }
  getProviders(): ISkillProvider[] { return [...this.providers.values()]; }
  getSources(): IInstallSource[] { return [...this.sources.values()]; }

  async scanAll(): Promise<void> {
    const results = await Promise.all([...this.providers.values()].map((p) => p.scan()));
    this.skills = results.flat();
    this.conflicts = this.conflictDetector.detect(this.skills);
  }

  getAllSkills(): Skill[] { return this.skills; }
  getSkillsByProvider(providerId: string): Skill[] { return this.skills.filter((s) => s.provider === providerId); }
  getConflicts(): ConflictInfo[] { return this.conflicts; }
  isConflicting(skillName: string): boolean { return this.conflicts.some((c) => c.skillName === skillName); }

  async createSkill(providerId: string, template: SkillTemplate): Promise<Skill> {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Provider not found: ${providerId}`);
    if (!provider.capabilities.canCreate) throw new Error(`Provider ${providerId} does not support creating skills`);
    return provider.create(template);
  }

  async uninstallSkill(skill: Skill): Promise<void> {
    const provider = this.providers.get(skill.provider);
    if (!provider) throw new Error(`Provider not found: ${skill.provider}`);
    await provider.uninstall(skill.name);
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
    if (sourceId === 'skillssh') { await this.scanAll(); return; }
    await provider.install(result.skillName, { sourceType: sourceId as 'github' | 'skillssh', identifier, tempDir: result.tempDir });
    await this.scanAll();
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
