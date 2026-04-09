import { BaseProvider, type ProviderCapabilities } from './provider.js';
import type { Skill } from '../models/index.js';
import { readdir, readFile, access, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseSkillMd } from '../parser.js';

async function isDirEntry(entry: { isDirectory(): boolean; isSymbolicLink(): boolean; name: string }, parentPath: string): Promise<boolean> {
  if (entry.isDirectory()) return true;
  if (entry.isSymbolicLink()) {
    try { return (await stat(path.join(parentPath, entry.name))).isDirectory(); } catch { return false; }
  }
  return false;
}

export class ClaudeProvider extends BaseProvider {
  readonly id = 'claude';
  readonly displayName = 'Claude';
  readonly basePaths: string[];
  readonly capabilities: ProviderCapabilities = {
    canInstall: false, canUninstall: false, canUpdate: false, canToggle: true, canCreate: false,
  };
  constructor(basePaths?: string[]) {
    super();
    this.basePaths = basePaths ?? [path.join(os.homedir(), '.claude', 'plugins', 'cache')];
  }

  override async scan(): Promise<Skill[]> {
    const skills: Skill[] = [];
    for (const basePath of this.basePaths) {
      try { await access(basePath); } catch { continue; }
      const publishers = await readdir(basePath, { withFileTypes: true });
      for (const pub of publishers) {
        if (!(await isDirEntry(pub, basePath))) continue;
        const pubPath = path.join(basePath, pub.name);
        const plugins = await readdir(pubPath, { withFileTypes: true });
        for (const plugin of plugins) {
          if (!(await isDirEntry(plugin, pubPath))) continue;
          const pluginPath = path.join(pubPath, plugin.name);
          const versions = await readdir(pluginPath, { withFileTypes: true });
          for (const ver of versions) {
            if (!(await isDirEntry(ver, pluginPath))) continue;
            const skillsDir = path.join(pluginPath, ver.name, 'skills');
            try { await access(skillsDir); } catch { continue; }
            const skillEntries = await readdir(skillsDir, { withFileTypes: true });
            for (const entry of skillEntries) {
              if (!(await isDirEntry(entry, skillsDir))) continue;
              const isDisabled = entry.name.startsWith('.disabled-');
              const skillDirName = isDisabled ? entry.name.slice('.disabled-'.length) : entry.name;
              if (entry.name.startsWith('.') && !isDisabled) continue;
              const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');
              try {
                const content = await readFile(skillMdPath, 'utf-8');
                const parsed = parseSkillMd(content);
                skills.push({
                  name: parsed.name || skillDirName, description: parsed.description,
                  provider: this.id, path: path.join(skillsDir, entry.name),
                  version: ver.name !== 'unknown' ? ver.name : undefined,
                  enabled: !isDisabled, scope: 'global', readonly: true,
                  metadata: { license: parsed.metadata.license, author: parsed.metadata.author ?? pub.name, tags: parsed.metadata.tags },
                });
              } catch { /* skip */ }
            }
          }
        }
      }
    }
    return skills;
  }

  override async disable(name: string): Promise<void> {
    for (const basePath of this.basePaths) {
      try { await access(basePath); } catch { continue; }
      const publishers = await readdir(basePath, { withFileTypes: true });
      for (const pub of publishers) {
        if (!(await isDirEntry(pub, basePath))) continue;
        const pubPath = path.join(basePath, pub.name);
        const plugins = await readdir(pubPath, { withFileTypes: true });
        for (const plugin of plugins) {
          if (!(await isDirEntry(plugin, pubPath))) continue;
          const pluginPath = path.join(pubPath, plugin.name);
          const versions = await readdir(pluginPath, { withFileTypes: true });
          for (const ver of versions) {
            if (!(await isDirEntry(ver, pluginPath))) continue;
            const skillsDir = path.join(pluginPath, ver.name, 'skills');
            try { await access(skillsDir); } catch { continue; }
            const src = path.join(skillsDir, name);
            const dest = path.join(skillsDir, `.disabled-${name}`);
            try {
              await access(src);
              await access(dest).then(
                () => { throw new Error(`Target ${dest} already exists`); },
                () => { /* dest doesn't exist, good */ },
              );
              await rename(src, dest);
              return;
            } catch (err) {
              if ((err as Error).message?.includes('already exists')) throw err;
            }
          }
        }
      }
    }
    throw new Error(`Skill "${name}" not found in ${this.displayName}`);
  }

  override async enable(name: string): Promise<void> {
    for (const basePath of this.basePaths) {
      try { await access(basePath); } catch { continue; }
      const publishers = await readdir(basePath, { withFileTypes: true });
      for (const pub of publishers) {
        if (!(await isDirEntry(pub, basePath))) continue;
        const pubPath = path.join(basePath, pub.name);
        const plugins = await readdir(pubPath, { withFileTypes: true });
        for (const plugin of plugins) {
          if (!(await isDirEntry(plugin, pubPath))) continue;
          const pluginPath = path.join(pubPath, plugin.name);
          const versions = await readdir(pluginPath, { withFileTypes: true });
          for (const ver of versions) {
            if (!(await isDirEntry(ver, pluginPath))) continue;
            const skillsDir = path.join(pluginPath, ver.name, 'skills');
            try { await access(skillsDir); } catch { continue; }
            const src = path.join(skillsDir, `.disabled-${name}`);
            const dest = path.join(skillsDir, name);
            try {
              await access(src);
              await rename(src, dest);
              return;
            } catch { /* not found here, try next */ }
          }
        }
      }
    }
    throw new Error(`Disabled skill "${name}" not found in ${this.displayName}`);
  }
}
