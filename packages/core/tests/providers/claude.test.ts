import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { mkdtemp, rm, mkdir, writeFile, readFile, access, symlink } from 'node:fs/promises';
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
    await writeFile(
      settingsPath,
      JSON.stringify(
        {
          skillOverrides: {
            deploy: 'off',
            'legacy-context': 'name-only',
          },
        },
        null,
        2,
      ),
    );

    const skills = await provider.scan();

    expect(skills.find((skill) => skill.name === 'deploy')?.enabled).toBe(false);
    expect(skills.find((skill) => skill.name === 'legacy-context')?.enabled).toBe(true);
  });

  it('keys flat skillOverrides by parsed Claude skill name, not directory name', async () => {
    const skillDir = path.join(flatDir, 'deploy-dir');
    await writeSkill(skillDir, 'deploy');
    await writeFile(
      settingsPath,
      JSON.stringify(
        {
          skillOverrides: {
            deploy: 'off',
          },
        },
        null,
        2,
      ),
    );

    const [skill] = await provider.scan();

    expect(skill.name).toBe('deploy');
    expect(skill.enabled).toBe(false);
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

  it('writes flat skillOverrides with the parsed Claude skill name', async () => {
    const skillDir = path.join(flatDir, 'deploy-dir');
    await writeSkill(skillDir, 'deploy');

    const [skill] = await provider.scan();
    await provider.setEnabled(skill, false);

    const settings = JSON.parse(await readFile(settingsPath, 'utf-8'));
    expect(settings.skillOverrides.deploy).toBe('off');
    expect(settings.skillOverrides['deploy-dir']).toBeUndefined();
    expect((await provider.scan())[0].enabled).toBe(false);
  });

  it('reads plugin skill availability from enabledPlugins', async () => {
    await writeSkill(
      path.join(cacheDir, 'team-tools', 'deploy-plugin', '1.0.0', 'skills', 'deploy'),
      'deploy-plugin:deploy',
    );
    await writeFile(
      settingsPath,
      JSON.stringify(
        {
          enabledPlugins: {
            'deploy-plugin@team-tools': false,
          },
        },
        null,
        2,
      ),
    );

    const skills = await provider.scan();

    expect(skills).toHaveLength(1);
    expect(skills[0].enabled).toBe(false);
    expect(skills[0].origin).toMatchObject({
      type: 'plugin',
      pluginId: 'deploy-plugin@team-tools',
      pluginName: 'deploy-plugin',
      marketplace: 'team-tools',
      version: '1.0.0',
      pluginEnabled: false,
    });
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

  it('surfaces broken flat skill symlinks as scan issues', async () => {
    await mkdir(flatDir, { recursive: true });
    await symlink(path.join(root, 'missing-skill'), path.join(flatDir, 'missing-skill'));

    const skills = await provider.scan();

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: 'missing-skill',
      provider: 'claude',
      scanIssues: [
        {
          code: 'broken-symlink',
          message: expect.any(String),
        },
      ],
    });
  });

  it('surfaces invalid plugin SKILL.md files as scan issues', async () => {
    const skillDir = path.join(cacheDir, 'team-tools', 'deploy-plugin', '1.0.0', 'skills', 'broken');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: [\n---\n');

    const skills = await provider.scan();

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: 'broken',
      provider: 'claude',
      origin: {
        type: 'plugin',
        pluginId: 'deploy-plugin@team-tools',
      },
      scanIssues: [
        {
          code: 'invalid-skill-md',
          message: expect.any(String),
        },
      ],
    });
  });
});
