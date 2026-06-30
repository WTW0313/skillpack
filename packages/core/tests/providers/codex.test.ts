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

  it('scans skills from directory', async () => {
    const skillDir = path.join(dir, 'test-skill');
    await mkdir(skillDir);
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: test-skill\ndescription: A test\n---\n\n# Test\n');
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

  it('creates a new skill', async () => {
    const skill = await provider.create({ name: 'new-skill', description: 'Brand new' });
    expect(skill.name).toBe('new-skill');
    expect(skill.source?.type).toBe('local');
  });

  it('uninstalls a skill', async () => {
    const skillDir = path.join(dir, 'to-delete');
    await mkdir(skillDir);
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: to-delete\ndescription: Delete me\n---\n');
    await provider.uninstall('to-delete');
    const skills = await provider.scan();
    expect(skills).toHaveLength(0);
  });

  it('reads enabled state from Codex config entries', async () => {
    const skillDir = path.join(dir, 'my-skill');
    await mkdir(skillDir);
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: my-skill\ndescription: Toggle me\n---\n');
    await writeFile(configPath, `[[skills.config]]\npath = "${path.join(skillDir, 'SKILL.md')}"\nenabled = false\n`);

    const skills = await provider.scan();

    expect(skills).toHaveLength(1);
    expect(skills[0].enabled).toBe(false);
  });

  it('disables a skill by writing Codex config without renaming the directory', async () => {
    const skillDir = path.join(dir, 'my-skill');
    await mkdir(skillDir);
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: my-skill\ndescription: Toggle me\n---\n');

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
    await mkdir(skillDir);
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: my-skill\ndescription: Toggle me\n---\n');
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
});
