import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export interface LockEntry {
  source: string;
  identifier?: string;
  repo?: string;
  ref?: string;
  commit?: string;
  path?: string;
  version?: string;
  installedAt: string;
  integrity: string;
}

interface LockfileData {
  lockfileVersion: number;
  skills: Record<string, LockEntry>;
}

export class LockfileManager {
  private filePath: string;
  private data: LockfileData = { lockfileVersion: 1, skills: {} };

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      this.data = JSON.parse(raw);
    } catch {
      this.data = { lockfileVersion: 1, skills: {} };
    }
  }

  async save(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2) + '\n', 'utf-8');
  }

  getEntries(): Record<string, LockEntry> {
    return { ...this.data.skills };
  }

  getEntry(name: string): LockEntry | undefined {
    return this.data.skills[name];
  }

  setEntry(name: string, entry: LockEntry): void {
    this.data.skills[name] = entry;
  }

  removeEntry(name: string): void {
    delete this.data.skills[name];
  }
}
