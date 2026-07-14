import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ConfigManager } from '../src/config.js';

describe('ConfigManager', () => {
  let root: string;
  let configDir: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'skillpack-config-'));
    configDir = path.join(root, 'config');
    await mkdir(configDir);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('preserves default providers and sources when a user overrides one provider path', async () => {
    const customCodexPath = path.join(root, 'custom-codex-skills');
    await writeFile(
      path.join(configDir, 'config.json'),
      JSON.stringify({
        providers: {
          codex: { paths: [customCodexPath] },
        },
      }),
      'utf-8',
    );

    const config = await new ConfigManager(configDir).load();

    expect(config.providers.codex.paths).toEqual([customCodexPath]);
    expect(config.providers.codex.enabled).toBe(true);
    expect(Object.keys(config.providers).sort()).toEqual(['claude', 'codex', 'global']);
    expect(config.providers.claude.paths).toEqual(
      expect.arrayContaining([
        expect.stringContaining(path.join('.claude', 'plugins', 'cache')),
        expect.stringContaining(path.join('.claude', 'skills')),
      ]),
    );
    expect(config.providers.global.paths[0]).toContain(path.join('.agents', 'skills'));
    expect(config.sources.github).toBeUndefined();
    expect(config.sources.skillssh.enabled).toBe(true);
  });

  it('auto-detects default provider paths against the configured home directory', async () => {
    const homeDir = path.join(root, 'home');
    await mkdir(path.join(homeDir, '.codex', 'skills'), { recursive: true });
    await mkdir(path.join(homeDir, '.codex', 'plugins', 'cache'), { recursive: true });
    await mkdir(path.join(homeDir, '.agents', 'skills'), { recursive: true });

    const config = await new ConfigManager({ configDir, homeDir }).load();

    expect(config.providers.codex).toEqual({
      enabled: true,
      paths: [path.join(homeDir, '.codex', 'skills'), path.join(homeDir, '.codex', 'plugins', 'cache')],
    });
    expect(config.providers.global).toEqual({
      enabled: true,
      paths: [path.join(homeDir, '.agents', 'skills')],
    });
    expect(config.providers.claude.enabled).toBe(false);
    expect(config.projectSkillsDirs).toEqual(['.codex/skills', '.claude/skills', '.agents/skills']);
    expect(config.usage.artifactRoots.codex).toEqual([
      path.join(homeDir, '.codex', 'sessions'),
      path.join(homeDir, '.codex', 'archived_sessions'),
    ]);
    expect(config.usage.artifactRoots.claude).toEqual([path.join(homeDir, '.claude', 'projects')]);
  });

  it('merges configured Usage Artifact Roots with defaults', async () => {
    const customClaudeUsageRoot = path.join(root, 'claude-history');
    await writeFile(
      path.join(configDir, 'config.json'),
      JSON.stringify({
        usage: {
          artifactRoots: {
            claude: [customClaudeUsageRoot],
          },
        },
      }),
      'utf-8',
    );

    const config = await new ConfigManager({ configDir, homeDir: path.join(root, 'home') }).load();

    expect(config.usage.artifactRoots.claude).toEqual([customClaudeUsageRoot]);
    expect(config.usage.artifactRoots.codex[0]).toContain(path.join('.codex', 'sessions'));
  });

  it('persists Usage Import Consent', async () => {
    const manager = new ConfigManager(configDir);
    let config = await manager.load();

    expect(config.usage.importConsent).toBe(false);

    config = await manager.setUsageImportConsent(true);

    expect(config.usage.importConsent).toBe(true);
    await expect(new ConfigManager(configDir).load()).resolves.toMatchObject({
      usage: { importConsent: true },
    });
  });
});
