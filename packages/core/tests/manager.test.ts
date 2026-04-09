import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SkillManager } from '../src/manager.js';
import { CodexProvider } from '../src/providers/codex.js';

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

  it('detects conflicts', async () => {
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
    expect(manager.getConflicts()).toHaveLength(1);
    expect(manager.getConflicts()[0].skillName).toBe('same-skill');
    await rm(dir2, { recursive: true, force: true });
  });

  it('creates a skill', async () => {
    const skill = await manager.createSkill('codex', { name: 'new', description: 'New skill' });
    expect(skill.name).toBe('new');
    await manager.scanAll();
    expect(manager.getAllSkills()).toHaveLength(1);
  });
});
