import type { RemoteSkill, UpdateInfo, DownloadResult } from '../models/source.js';
import type { Skill } from '../models/skill.js';

export interface IInstallSource {
  readonly id: string;
  readonly displayName: string;
  search(query: string): Promise<RemoteSkill[]>;
  fetch(identifier: string): Promise<DownloadResult>;
  checkUpdate(skill: Skill): Promise<UpdateInfo | null>;
  checkUpdates?(skills: Skill[]): Promise<Array<{ skill: Skill; update: UpdateInfo }>>;
}
