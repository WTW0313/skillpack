import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { access, mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SkillManager } from '../src/manager.js';
import { CodexProvider } from '../src/providers/codex.js';
import { GlobalProvider } from '../src/providers/global.js';
import { SkillsShSource } from '../src/sources/skillssh.js';
import type { Skill } from '../src/models/index.js';
import type { IInstallSource } from '../src/sources/source.js';

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

  it('does not toggle Global Skills by renaming shared content', async () => {
    const globalDir = path.join(dir, 'global');
    const skillDir = path.join(globalDir, 'shared-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: shared-skill\ndescription: shared\n---\n');

    const customManager = new SkillManager();
    customManager.registerProvider(new GlobalProvider([globalDir]));
    await customManager.scanAll();

    const [skill] = customManager.getAllSkills();
    await expect(customManager.toggleSkill(skill)).rejects.toThrow('does not support toggle');
    await expect(access(skillDir)).resolves.toBeUndefined();
  });

  it('rejects installs to non-Global providers before fetching from a source', async () => {
    let fetchCount = 0;
    const source: IInstallSource = {
      id: 'skillssh',
      displayName: 'skills.sh',
      search: async () => [],
      fetch: async () => {
        fetchCount += 1;
        return { tempDir: dir, skillName: 'managed-skill', files: [] };
      },
      checkUpdate: async () => null,
    };
    manager.registerSource(source);

    await expect(manager.installFromSource('skillssh', 'owner/repo', 'codex')).rejects.toThrow('Global Skills');
    expect(fetchCount).toBe(0);
  });

  it('rejects non-skills.sh install sources before fetching', async () => {
    let fetchCount = 0;
    const source: IInstallSource = {
      id: 'github',
      displayName: 'GitHub',
      search: async () => [],
      fetch: async () => {
        fetchCount += 1;
        return { tempDir: dir, skillName: 'github-skill', files: [] };
      },
      checkUpdate: async () => null,
    };
    manager.registerSource(source);

    await expect(manager.installFromSource('github', 'owner/repo/path', 'global')).rejects.toThrow('skills.sh');
    expect(fetchCount).toBe(0);
  });

  it('checks updates only for skills.sh-managed Global Skills', async () => {
    let checkCount = 0;
    const source: IInstallSource = {
      id: 'skillssh',
      displayName: 'skills.sh',
      search: async () => [],
      fetch: async () => ({ tempDir: dir, skillName: 'managed-skill', files: [] }),
      checkUpdate: async () => {
        checkCount += 1;
        return { hasUpdate: true, latestVersion: 'latest' };
      },
    };
    manager.registerSource(source);

    const skillDir = path.join(dir, 'linked-skill');
    await mkdir(skillDir);
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: linked-skill\ndescription: linked\n---\n');
    await manager.scanAll();
    manager.getAllSkills()[0].source = { type: 'skillssh' };

    await expect(manager.checkUpdates()).resolves.toEqual([]);
    expect(checkCount).toBe(0);

    await expect(manager.checkSkillUpdate({
      name: 'managed-skill',
      description: '',
      provider: 'global',
      path: path.join(dir, 'managed-skill'),
      enabled: true,
      scope: 'global',
      metadata: {},
      source: { type: 'skillssh' },
    })).resolves.toEqual({ hasUpdate: true, latestVersion: 'latest' });
    expect(checkCount).toBe(1);
  });

  it('updates only skills.sh-managed Global Skills', async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    manager.registerSource(new SkillsShSource(async (command, args) => {
      calls.push({ command, args });
      return { stdout: '', stderr: '' };
    }));

    const linkedSkill: Skill = {
      name: 'linked-skill',
      description: '',
      provider: 'codex',
      path: path.join(dir, 'linked-skill'),
      enabled: true,
      scope: 'global',
      metadata: {},
      source: { type: 'skillssh' },
    };
    await expect(manager.updateSkill(linkedSkill)).rejects.toThrow('Only skills.sh-managed Global Skills can be updated');
    expect(calls).toEqual([]);

    await manager.updateSkill({
      ...linkedSkill,
      provider: 'global',
      path: path.join(dir, 'managed-skill'),
    });

    expect(calls).toEqual([{
      command: 'npx',
      args: ['skills', 'update', 'linked-skill', '-g', '-y'],
    }]);
  });

  it('reports provider and project scan paths while scanning custom paths and skipping missing paths', async () => {
    const missingProviderPath = path.join(dir, 'missing-provider');
    const customProviderPath = path.join(dir, 'custom-provider');
    const projectRoot = path.join(dir, 'repo');
    await mkdir(path.join(customProviderPath, 'custom-skill'), { recursive: true });
    await writeFile(path.join(customProviderPath, 'custom-skill', 'SKILL.md'), '---\nname: custom-skill\ndescription: custom\n---\n');
    await mkdir(path.join(projectRoot, '.custom', 'skills', 'project-skill'), { recursive: true });
    await writeFile(path.join(projectRoot, '.custom', 'skills', 'project-skill', 'SKILL.md'), '---\nname: project-skill\ndescription: project\n---\n');

    const customManager = new SkillManager();
    customManager.registerProvider(new CodexProvider([missingProviderPath, customProviderPath]));

    await customManager.scanAll(projectRoot, ['missing-project-skills', '.custom/skills']);

    expect(customManager.getAllSkills().map((skill) => skill.name)).toContain('custom-skill');
    expect(customManager.getProjectSkills().map((skill) => skill.name)).toEqual(['project-skill']);
    expect(customManager.getScanPathDiagnostics()).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'provider', provider: 'codex', path: missingProviderPath, exists: false }),
      expect.objectContaining({ scope: 'provider', provider: 'codex', path: customProviderPath, exists: true }),
      expect.objectContaining({ scope: 'project', path: path.join(projectRoot, 'missing-project-skills'), exists: false }),
      expect.objectContaining({ scope: 'project', path: path.join(projectRoot, '.custom', 'skills'), exists: true }),
    ]));
  });
});
