import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CodexProvider } from '../../src/providers/codex.js';

describe('CodexProvider', () => {
  let dir: string;
  let configPath: string;
  let provider: CodexProvider;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'skillpack-codex-'));
    configPath = path.join(dir, 'config.toml');
    provider = new CodexProvider([dir], configPath);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function writeSkill(skillDir: string, name: string, description = 'A test skill') {
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n`);
  }

  async function writePluginSkill(
    pluginCacheDir: string,
    marketplace: string,
    pluginName: string,
    version: string,
    skillName: string,
    manifestName = pluginName,
  ) {
    const pluginRoot = path.join(pluginCacheDir, marketplace, pluginName, version);
    await mkdir(path.join(pluginRoot, '.codex-plugin'), { recursive: true });
    await writeFile(path.join(pluginRoot, '.codex-plugin', 'plugin.json'), JSON.stringify({
      name: manifestName,
      version,
      skills: './skills/',
      interface: { displayName: manifestName.toUpperCase() },
    }), 'utf-8');
    await writeSkill(path.join(pluginRoot, 'skills', skillName), skillName);
    return pluginRoot;
  }

  it('scans skills from directory', async () => {
    const skillDir = path.join(dir, 'test-skill');
    await writeSkill(skillDir, 'test-skill', 'A test');
    const skills = await provider.scan();
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('test-skill');
    expect(skills[0].provider).toBe('codex');
  });

  it('skips directories without SKILL.md', async () => {
    await mkdir(path.join(dir, 'empty-dir'));
    const skills = await provider.scan();
    expect(skills).toHaveLength(0);
  });

  it('reads enabled state from Codex config entries', async () => {
    const skillDir = path.join(dir, 'my-skill');
    await writeSkill(skillDir, 'my-skill', 'Toggle me');
    await writeFile(configPath, `[[skills.config]]\npath = "${path.join(skillDir, 'SKILL.md')}"\nenabled = false\n`);

    const skills = await provider.scan();

    expect(skills).toHaveLength(1);
    expect(skills[0].enabled).toBe(false);
  });

  it('does not let later TOML tables overwrite Codex skill config state', async () => {
    const skillDir = path.join(dir, 'my-skill');
    await writeSkill(skillDir, 'my-skill', 'Toggle me');
    await writeFile(configPath, [
      '[[skills.config]]',
      `path = "${path.join(skillDir, 'SKILL.md')}"`,
      'enabled = false',
      '',
      '[mcp_servers.example]',
      'command = "example"',
      'enabled = true',
      '',
    ].join('\n'));

    const skills = await provider.scan();

    expect(skills).toHaveLength(1);
    expect(skills[0].enabled).toBe(false);
  });

  it('disables a skill by writing Codex config without renaming the directory', async () => {
    const skillDir = path.join(dir, 'my-skill');
    await writeSkill(skillDir, 'my-skill', 'Toggle me');

    const [skill] = await provider.scan();
    await provider.setEnabled(skill, false);

    await expect(access(path.join(dir, 'my-skill'))).resolves.toBeUndefined();
    await expect(access(path.join(dir, '.disabled-my-skill'))).rejects.toThrow();
    expect(await readFile(configPath, 'utf-8')).toContain(`path = "${path.join(skillDir, 'SKILL.md')}"\nenabled = false`);

    const skills = await provider.scan();
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('my-skill');
    expect(skills[0].enabled).toBe(false);
  });

  it('enables a disabled skill by writing Codex config', async () => {
    const skillDir = path.join(dir, 'my-skill');
    await writeSkill(skillDir, 'my-skill', 'Toggle me');
    await writeFile(configPath, `[[skills.config]]\npath = "${path.join(skillDir, 'SKILL.md')}"\nenabled = false\n`);

    const [skill] = await provider.scan();
    await provider.setEnabled(skill, true);

    await expect(access(path.join(dir, 'my-skill'))).resolves.toBeUndefined();
    expect(await readFile(configPath, 'utf-8')).toContain(`path = "${path.join(skillDir, 'SKILL.md')}"\nenabled = true`);

    const skills = await provider.scan();
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('my-skill');
    expect(skills[0].enabled).toBe(true);
  });

  it('scans Codex plugin-owned skills from active plugin cache roots', async () => {
    const skillRoot = path.join(dir, 'skills');
    const pluginCache = path.join(dir, 'plugins', 'cache');
    const pluginConfig = path.join(dir, 'config.toml');
    const pluginProvider = new CodexProvider([skillRoot, pluginCache], pluginConfig);
    await writePluginSkill(pluginCache, 'openai-curated', 'github', '1.2.3', 'yeet', 'github');
    await writeFile(pluginConfig, '[plugins."github@openai-curated"]\nenabled = true\n');

    const skills = await pluginProvider.scan();

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: 'yeet',
      provider: 'codex',
      enabled: true,
      origin: {
        type: 'plugin',
        pluginId: 'github@openai-curated',
        pluginName: 'github',
        marketplace: 'openai-curated',
        version: '1.2.3',
        displayName: 'GITHUB',
        pluginEnabled: true,
      },
    });
  });

  it('combines Codex plugin access and per-skill config for availability', async () => {
    const pluginCache = path.join(dir, 'plugins', 'cache');
    const pluginProvider = new CodexProvider([pluginCache], configPath);
    await writePluginSkill(pluginCache, 'openai-curated', 'github', '1.2.3', 'yeet');
    await writeFile(configPath, [
      '[plugins."github@openai-curated"]',
      'enabled = true',
      '',
      '[[skills.config]]',
      `path = "${path.join(pluginCache, 'openai-curated', 'github', '1.2.3', 'skills', 'yeet', 'SKILL.md')}"`,
      'enabled = false',
      '',
    ].join('\n'));

    const [skill] = await pluginProvider.scan();

    expect(skill.enabled).toBe(false);
    expect(skill.origin).toMatchObject({
      type: 'plugin',
      pluginEnabled: true,
      skillConfigEnabled: false,
    });
  });

  it('treats missing Codex plugin config as enabled and writes plugin config when toggled', async () => {
    const pluginCache = path.join(dir, 'plugins', 'cache');
    const pluginProvider = new CodexProvider([pluginCache], configPath);
    await writePluginSkill(pluginCache, 'openai-curated-remote', 'product-design', '0.1.47', 'audit');

    const [skill] = await pluginProvider.scan();
    expect(skill.enabled).toBe(true);
    expect(skill.origin).toMatchObject({
      type: 'plugin',
      pluginId: 'product-design@openai-curated-remote',
      pluginEnabled: true,
    });

    await pluginProvider.setEnabled(skill, false);

    expect(await readFile(configPath, 'utf-8')).toContain('[plugins."product-design@openai-curated-remote"]\nenabled = false');
  });

  it('toggles Codex plugin-owned skills through the owning plugin config', async () => {
    const pluginCache = path.join(dir, 'plugins', 'cache');
    const pluginProvider = new CodexProvider([pluginCache], configPath);
    await writePluginSkill(pluginCache, 'openai-curated', 'github', '1.2.3', 'yeet');
    await writePluginSkill(pluginCache, 'openai-curated', 'github', '1.2.3', 'github');
    await writeFile(configPath, '[plugins."github@openai-curated"]\nenabled = true\n');

    const [skill] = await pluginProvider.scan();
    await pluginProvider.setEnabled(skill, false);

    expect(await readFile(configPath, 'utf-8')).toContain('[plugins."github@openai-curated"]\nenabled = false');
    const rescanned = await pluginProvider.scan();
    expect(rescanned.map((item) => item.enabled)).toEqual([false, false]);
  });

  it('hides duplicate Codex plugin cache roots from the main scan when a configured root exists for the same plugin', async () => {
    const pluginCache = path.join(dir, 'plugins', 'cache');
    const pluginProvider = new CodexProvider([pluginCache], configPath);
    await writePluginSkill(pluginCache, 'openai-curated', 'github', '3fdeeb49', 'yeet');
    await writePluginSkill(pluginCache, 'openai-curated-remote', 'github', '0.1.5', 'yeet');
    await writeFile(configPath, '[plugins."github@openai-curated"]\nenabled = true\n');

    const skills = await pluginProvider.scan();

    expect(skills).toHaveLength(1);
    expect(skills[0].origin).toMatchObject({
      type: 'plugin',
      pluginId: 'github@openai-curated',
    });
  });

  it('does not expose a plugin toggle when plugin path and manifest identity disagree', async () => {
    const pluginCache = path.join(dir, 'plugins', 'cache');
    const pluginProvider = new CodexProvider([pluginCache], configPath);
    await writePluginSkill(pluginCache, 'openai-curated', 'github', '1.2.3', 'yeet', 'not-github');
    await writeFile(configPath, '[plugins."github@openai-curated"]\nenabled = true\n');

    const [skill] = await pluginProvider.scan();

    expect(skill.scanIssues).toEqual([{
      code: 'plugin-identity-mismatch',
      message: 'Codex plugin manifest name "not-github" does not match cache plugin "github"',
    }]);
    expect(pluginProvider.getDisableStrategy(skill)).toBeUndefined();
  });
});
