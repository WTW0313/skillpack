import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { access, mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SkillManager } from '../src/manager.js';
import { CodexProvider } from '../src/providers/codex.js';
import { SkillsShSource } from '../src/sources/skillssh.js';
import type { Skill } from '../src/models/index.js';

describe('SkillManager', () => {
  let dir: string;
  let manager: SkillManager;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'skillpack-mgr-'));
    manager = new SkillManager();
    manager.registerProvider(new CodexProvider([dir]));
  });

  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('scans all providers', async () => {
    const skillDir = path.join(dir, 'test');
    await mkdir(skillDir);
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: test\ndescription: t\n---\n');
    await manager.scanAll();
    expect(manager.getAllSkills()).toHaveLength(1);
  });

  it('detects duplicates', async () => {
    const dir2 = await mkdtemp(path.join(tmpdir(), 'skillpack-mgr2-'));
    const provider2 = new CodexProvider([dir2]);
    (provider2 as any).id = 'other';
    manager.registerProvider(provider2);
    for (const d of [dir, dir2]) {
      const skillDir = path.join(d, 'same-skill');
      await mkdir(skillDir);
      await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: same-skill\ndescription: dup\n---\n');
    }
    await manager.scanAll();
    expect(manager.getDuplicates()).toHaveLength(1);
    expect(manager.getDuplicates()[0].skillName).toBe('same-skill');
    await rm(dir2, { recursive: true, force: true });
  });

  it('does not remove provider-local skills', async () => {
    const skillDir = path.join(dir, 'local-skill');
    await mkdir(skillDir);
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: local-skill\ndescription: local\n---\n');
    await manager.scanAll();

    await expect(manager.uninstallSkill(manager.getAllSkills()[0])).rejects.toThrow('Only skills.sh-managed Global Skills can be removed');
    await expect(access(skillDir)).resolves.toBeUndefined();
  });

  it('removes skills.sh-managed Global Skills through the skills CLI', async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    manager.registerSource(new SkillsShSource(async (command, args) => {
      calls.push({ command, args });
      return { stdout: '', stderr: '' };
    }));
    const skill: Skill = {
      name: 'managed-skill',
      description: '',
      provider: 'global',
      path: path.join(dir, 'managed-skill'),
      enabled: true,
      scope: 'global',
      metadata: {},
      source: { type: 'skillssh' },
    };

    await manager.uninstallSkill(skill);

    expect(calls).toEqual([{
      command: 'npx',
      args: ['skills', 'remove', 'managed-skill', '-g', '-y'],
    }]);
  });
});
