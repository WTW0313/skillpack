import { describe, expect, it } from 'vitest';
import { SkillsShSource } from '../../src/sources/skillssh.js';

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
});
