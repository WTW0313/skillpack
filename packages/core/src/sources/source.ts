import type { RemoteSkill, UpdateInfo, DownloadResult } from '../models/source.js';
import type { Skill } from '../models/skill.js';

export type UpdateCheckSkill = Pick<Skill, 'name' | 'version' | 'source'>;

export interface IInstallSource {
  readonly id: string;
  readonly displayName: string;
  search(query: string): Promise<RemoteSkill[]>;
  fetch(identifier: string): Promise<DownloadResult>;
  checkUpdate(skill: UpdateCheckSkill): Promise<UpdateInfo | null>;
  checkUpdates?(skills: Skill[]): Promise<Array<{ skill: Skill; update: UpdateInfo }>>;
}
