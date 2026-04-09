import { BaseProvider, type ProviderCapabilities } from './provider.js';
import type { Skill } from '../models/index.js';
import { readdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseSkillMd } from '../parser.js';

export class ClaudeProvider extends BaseProvider {
  readonly id = 'claude';
  readonly displayName = 'Claude';
  readonly basePaths: string[];
  readonly capabilities: ProviderCapabilities = {
    canInstall: false, canUninstall: false, canUpdate: false, canToggle: false, canCreate: false,
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
        if (!pub.isDirectory()) continue;
        const plugins = await readdir(path.join(basePath, pub.name), { withFileTypes: true });
        for (const plugin of plugins) {
          if (!plugin.isDirectory()) continue;
          const versions = await readdir(path.join(basePath, pub.name, plugin.name), { withFileTypes: true });
          for (const ver of versions) {
            if (!ver.isDirectory()) continue;
            const skillsDir = path.join(basePath, pub.name, plugin.name, ver.name, 'skills');
            try { await access(skillsDir); } catch { continue; }
            const skillEntries = await readdir(skillsDir, { withFileTypes: true });
            for (const entry of skillEntries) {
              if (!entry.isDirectory()) continue;
              const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');
              try {
                const content = await readFile(skillMdPath, 'utf-8');
                const parsed = parseSkillMd(content);
                skills.push({
                  name: parsed.name || entry.name, description: parsed.description,
                  provider: this.id, path: path.join(skillsDir, entry.name),
                  version: ver.name !== 'unknown' ? ver.name : undefined,
                  enabled: true, scope: 'global', readonly: true,
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
}
