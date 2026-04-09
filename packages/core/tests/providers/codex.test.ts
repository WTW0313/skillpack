import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CodexProvider } from '../../src/providers/codex.js';

describe('CodexProvider', () => {
  let dir: string;
  let provider: CodexProvider;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'skillpack-codex-'));
    provider = new CodexProvider([dir]);
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
    expect(skill.readonly).toBe(false);
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
});
