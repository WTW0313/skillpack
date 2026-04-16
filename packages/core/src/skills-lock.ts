import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export interface SkillsLockEntry {
  source: string;
  sourceType: string;
  sourceUrl: string;
  skillPath: string;
  skillFolderHash: string;
  installedAt: string;
  updatedAt: string;
}

interface SkillsLockData {
  version: number;
  skills: Record<string, SkillsLockEntry>;
}

export class SkillsLockReader {
  private data: SkillsLockData = { version: 3, skills: {} };

  async load(lockPath?: string): Promise<void> {
    const filePath = lockPath ?? path.join(os.homedir(), '.agents', '.skill-lock.json');
    try {
      const raw = await readFile(filePath, 'utf-8');
      this.data = JSON.parse(raw);
    } catch {
      this.data = { version: 3, skills: {} };
    }
  }

  getEntry(name: string): SkillsLockEntry | undefined {
    return this.data.skills[name];
  }

  getEntries(): Record<string, SkillsLockEntry> {
    return { ...this.data.skills };
  }
}
