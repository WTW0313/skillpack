import { describe, expect, it } from 'vitest';
import { SkillsShSource } from '../../src/sources/skillssh.js';
import type { Skill } from '../../src/models/index.js';

describe('SkillsShSource', () => {
  it('installs a selected skills.sh skill into Global Skills through the skills CLI', async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const source = new SkillsShSource(async (command, args) => {
      calls.push({ command, args });
      return { stdout: '', stderr: '' };
    });

    const result = await source.fetch('owner/repo@skill-name');

    expect(result.skillName).toBe('skill-name');
    expect(calls).toEqual([{
      command: 'npx',
      args: ['skills', 'add', 'owner/repo', '-g', '-y', '--skill', 'skill-name'],
    }]);
  });

  it('checks for updates through the skills CLI only when requested', async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const source = new SkillsShSource(async (command, args) => {
      calls.push({ command, args });
      return { stdout: 'demo-skill update available\n', stderr: '' };
    });
    const skill: Skill = {
      name: 'demo-skill',
      description: '',
      provider: 'global',
      path: '/fake/demo-skill',
      enabled: true,
      scope: 'global',
      metadata: {},
      source: { type: 'skillssh', skillFolderHash: 'abcdef123456' },
    };

    const update = await source.checkUpdate(skill);

    expect(update).toEqual({
      currentVersion: 'abcdef1',
      latestVersion: 'latest',
      hasUpdate: true,
    });
    expect(calls).toEqual([{ command: 'npx', args: ['skills', 'check'] }]);
  });

  it('updates a skills.sh-managed Global Skill through the skills CLI', async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const source = new SkillsShSource(async (command, args) => {
      calls.push({ command, args });
      return { stdout: '', stderr: '' };
    });

    await source.updateViaCli('demo-skill');

    expect(calls).toEqual([{
      command: 'npx',
      args: ['skills', 'update', 'demo-skill', '-g', '-y'],
    }]);
  });
});
