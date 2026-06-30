import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ClaudeProvider } from '../../src/providers/claude.js';

async function writeSkill(dir: string, name: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name}\n---\n`);
}

describe('ClaudeProvider', () => {
  let root: string;
  let flatDir: string;
  let cacheDir: string;
  let settingsPath: string;
  let provider: ClaudeProvider;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'skillpack-claude-'));
    flatDir = path.join(root, 'skills');
    cacheDir = path.join(root, 'plugins', 'cache');
    settingsPath = path.join(root, 'settings.json');
    provider = new ClaudeProvider([cacheDir], [flatDir], settingsPath);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reads flat skill availability from skillOverrides', async () => {
    await writeSkill(path.join(flatDir, 'deploy'), 'deploy');
    await writeSkill(path.join(flatDir, 'legacy-context'), 'legacy-context');
    await writeFile(settingsPath, JSON.stringify({
      skillOverrides: {
        deploy: 'off',
        'legacy-context': 'name-only',
      },
    }, null, 2));

    const skills = await provider.scan();

    expect(skills.find((skill) => skill.name === 'deploy')?.enabled).toBe(false);
    expect(skills.find((skill) => skill.name === 'legacy-context')?.enabled).toBe(true);
  });

  it('toggles flat skills through skillOverrides without renaming directories', async () => {
    const skillDir = path.join(flatDir, 'deploy');
    await writeSkill(skillDir, 'deploy');

    const [skill] = await provider.scan();
    await provider.setEnabled(skill, false);

    await expect(access(skillDir)).resolves.toBeUndefined();
    await expect(access(path.join(flatDir, '.disabled-deploy'))).rejects.toThrow();
    expect(JSON.parse(await readFile(settingsPath, 'utf-8')).skillOverrides.deploy).toBe('off');
    expect((await provider.scan())[0].enabled).toBe(false);

    await provider.setEnabled({ ...skill, enabled: false }, true);

    expect(JSON.parse(await readFile(settingsPath, 'utf-8')).skillOverrides.deploy).toBe('on');
    expect((await provider.scan())[0].enabled).toBe(true);
  });

  it('reads plugin skill availability from enabledPlugins', async () => {
    await writeSkill(path.join(cacheDir, 'team-tools', 'deploy-plugin', '1.0.0', 'skills', 'deploy'), 'deploy-plugin:deploy');
    await writeFile(settingsPath, JSON.stringify({
      enabledPlugins: {
        'deploy-plugin@team-tools': false,
      },
    }, null, 2));

    const skills = await provider.scan();

    expect(skills).toHaveLength(1);
    expect(skills[0].enabled).toBe(false);
  });

  it('toggles plugin skills through enabledPlugins for the owning plugin', async () => {
    const skillDir = path.join(cacheDir, 'team-tools', 'deploy-plugin', '1.0.0', 'skills', 'deploy');
    await writeSkill(skillDir, 'deploy-plugin:deploy');

    const [skill] = await provider.scan();
    await provider.setEnabled(skill, false);

    await expect(access(skillDir)).resolves.toBeUndefined();
    expect(JSON.parse(await readFile(settingsPath, 'utf-8')).enabledPlugins['deploy-plugin@team-tools']).toBe(false);

    await provider.setEnabled({ ...skill, enabled: false }, true);

    expect(JSON.parse(await readFile(settingsPath, 'utf-8')).enabledPlugins['deploy-plugin@team-tools']).toBe(true);
  });
});
