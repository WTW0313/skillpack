import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SkillManager } from '../src/manager.js';
import { buildSkillInventory } from '../src/models/inventory.js';
import { CodexProvider } from '../src/providers/codex.js';
import { GlobalProvider } from '../src/providers/global.js';

async function writeSkill(dir: string, name: string, description = 'Test skill'): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n`);
}

describe('Skill Inventory', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'skillpack-inventory-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('groups provider instances that resolve to the same skill path as confirmed', async () => {
    const canonicalSkill = path.join(root, 'shared', 'figma');
    const codexDir = path.join(root, 'codex');
    const globalDir = path.join(root, 'global');
    await writeSkill(canonicalSkill, 'figma');
    await mkdir(codexDir);
    await mkdir(globalDir);
    await symlink(canonicalSkill, path.join(codexDir, 'figma'));
    await symlink(canonicalSkill, path.join(globalDir, 'figma'));

    const manager = new SkillManager();
    manager.registerProvider(new CodexProvider([codexDir]));
    manager.registerProvider(new GlobalProvider([globalDir]));

    await manager.scanAll();

    const inventory = manager.getInventory();
    expect(inventory).toHaveLength(1);
    expect(inventory[0].name).toBe('figma');
    expect(inventory[0].identity.confidence).toBe('confirmed');
    expect(inventory[0].instances.map((instance) => instance.provider).sort()).toEqual(['codex', 'global']);
  });

  it('groups provider instances by normalized name as inferred when provenance is unavailable', async () => {
    const codexDir = path.join(root, 'codex');
    const globalDir = path.join(root, 'global');
    await writeSkill(path.join(codexDir, 'figma-tool'), 'figma-tool');
    await writeSkill(path.join(globalDir, 'figma_tool'), 'Figma Tool');

    const manager = new SkillManager();
    manager.registerProvider(new CodexProvider([codexDir]));
    manager.registerProvider(new GlobalProvider([globalDir]));

    await manager.scanAll();

    const inventory = manager.getInventory();
    expect(inventory).toHaveLength(1);
    expect(inventory[0].identity.confidence).toBe('inferred');
    expect(inventory[0].healthSignals.map((signal) => signal.code)).toContain('inferred-identity');
  });

  it('keeps project skills out of controllable inventory without shadowing provider skills', async () => {
    const codexDir = path.join(root, 'codex');
    const projectDir = path.join(root, 'project');
    await writeSkill(path.join(codexDir, 'repo-helper'), 'repo-helper');
    await writeSkill(path.join(projectDir, '.agents', 'skills', 'repo-helper'), 'repo-helper');

    const manager = new SkillManager();
    manager.registerProvider(new CodexProvider([codexDir]));

    await manager.scanAll(projectDir, ['.agents/skills']);

    const inventory = manager.getInventory();
    expect(inventory).toHaveLength(1);
    expect(inventory[0].instances).toHaveLength(1);
    expect(inventory[0].instances[0].provider).toBe('codex');
    expect(manager.getProjectSkills()).toHaveLength(1);
    expect(manager.getProjectSkills()[0].actions).toEqual([]);
  });

  it('surfaces invalid SKILL.md files as health signals', async () => {
    const codexDir = path.join(root, 'codex');
    const brokenSkill = path.join(codexDir, 'broken');
    await mkdir(brokenSkill, { recursive: true });
    await writeFile(path.join(brokenSkill, 'SKILL.md'), '---\nname: [unterminated\n---\n');

    const manager = new SkillManager();
    manager.registerProvider(new CodexProvider([codexDir]));

    await manager.scanAll();

    const inventory = manager.getInventory();
    expect(inventory).toHaveLength(1);
    expect(inventory[0].name).toBe('broken');
    expect(inventory[0].healthSignals.map((signal) => signal.code)).toContain('invalid-skill-md');
  });

  it('surfaces broken skill symlinks as health signals', async () => {
    const codexDir = path.join(root, 'codex');
    await mkdir(codexDir);
    await symlink(path.join(root, 'missing-skill'), path.join(codexDir, 'missing-skill'));

    const manager = new SkillManager();
    manager.registerProvider(new CodexProvider([codexDir]));

    await manager.scanAll();

    const inventory = manager.getInventory();
    expect(inventory).toHaveLength(1);
    expect(inventory[0].name).toBe('missing-skill');
    expect(inventory[0].healthSignals.map((signal) => signal.code)).toContain('broken-symlink');
  });

  it('exposes provider-safe actions and flags unmanaged Global Skills', async () => {
    const codexDir = path.join(root, 'codex');
    const globalDir = path.join(root, 'global');
    await writeSkill(path.join(codexDir, 'local-codex'), 'local-codex');
    await writeSkill(path.join(globalDir, 'local-global'), 'local-global');

    const manager = new SkillManager();
    manager.registerProvider(new CodexProvider([codexDir]));
    manager.registerProvider(new GlobalProvider([globalDir]));

    await manager.scanAll();

    const inventory = manager.getInventory();
    const codex = inventory.find((group) => group.name === 'local-codex')!;
    const global = inventory.find((group) => group.name === 'local-global')!;

    expect(codex.instances[0].actions).toEqual(['disable']);
    expect(global.instances[0].actions).toEqual([]);
    expect(global.healthSignals.map((signal) => signal.code)).toContain('unmanaged-global-skill');
  });

  it('does not expose enable or disable actions for skills.sh-managed Global Skills', () => {
    const inventory = buildSkillInventory([{
      name: 'managed-global',
      description: '',
      provider: 'global',
      path: path.join(root, 'global', 'managed-global'),
      enabled: true,
      scope: 'global',
      metadata: {},
      source: { type: 'skillssh', repo: 'owner/repo' },
    }]);

    expect(inventory).toHaveLength(1);
    expect(inventory[0].identity.confidence).toBe('confirmed');
    expect(inventory[0].instances[0].actions).toEqual(['update', 'remove']);
  });

  it('does not expose toggle actions when the provider has no Disable Strategy', () => {
    const inventory = buildSkillInventory([{
      name: 'plugin-skill',
      description: '',
      provider: 'codex',
      path: path.join(root, 'codex', 'plugin-skill'),
      enabled: true,
      scope: 'global',
      metadata: {},
      origin: {
        type: 'plugin',
        pluginId: 'github@openai-curated',
        pluginName: 'github',
        marketplace: 'openai-curated',
        pluginEnabled: true,
        identityStatus: 'mismatched',
      },
      source: { type: 'local' },
    }], {
      getDisableStrategy: () => undefined,
    });

    expect(inventory[0].instances[0].actions).toEqual([]);
  });

  it('surfaces remembered skills.sh update checks as health signals', () => {
    const inventory = buildSkillInventory([{
      name: 'managed-global',
      description: '',
      provider: 'global',
      path: path.join(root, 'global', 'managed-global'),
      enabled: true,
      scope: 'global',
      metadata: {},
      source: { type: 'skillssh', repo: 'owner/repo' },
    }], {
      hasUpdate: () => true,
    });

    expect(inventory[0].healthSignals.map((signal) => signal.code)).toContain('update-available');
  });

  it('exposes the provider Disable Strategy for mutable inventory instances', async () => {
    const codexDir = path.join(root, 'codex');
    const codexConfig = path.join(root, 'codex-config.toml');
    await writeSkill(path.join(codexDir, 'toggle-me'), 'toggle-me');

    const manager = new SkillManager();
    manager.registerProvider(new CodexProvider([codexDir], codexConfig));

    await manager.scanAll();

    const instance = manager.getInventory()[0].instances[0];
    expect(instance.disableStrategy).toEqual({
      type: 'provider-config',
      description: 'Writes [[skills.config]] in Codex config.toml',
    });
  });

  it('toggles the selected inventory instance through provider config without changing same-name siblings', async () => {
    const firstCodexDir = path.join(root, 'codex-one');
    const secondCodexDir = path.join(root, 'codex-two');
    const codexConfig = path.join(root, 'codex-config.toml');
    await writeSkill(path.join(firstCodexDir, 'shared'), 'shared');
    await writeSkill(path.join(secondCodexDir, 'shared'), 'shared');

    const manager = new SkillManager();
    manager.registerProvider(new CodexProvider([firstCodexDir, secondCodexDir], codexConfig));

    await manager.scanAll();
    const before = manager.getInventory()[0].instances;
    const target = before.find((instance) => instance.path.startsWith(secondCodexDir))!;

    await manager.toggleInventoryInstance(target);
    await manager.scanAll();

    const after = manager.getInventory()[0].instances;
    expect(after.find((instance) => instance.path.startsWith(firstCodexDir))?.enabled).toBe(true);
    expect(after.find((instance) => instance.path.startsWith(secondCodexDir))?.enabled).toBe(false);
  });

  it('keeps invalid Project Skills visible as read-only project inventory', async () => {
    const projectDir = path.join(root, 'project');
    const brokenProjectSkill = path.join(projectDir, '.agents', 'skills', 'broken-project');
    await mkdir(brokenProjectSkill, { recursive: true });
    await writeFile(path.join(brokenProjectSkill, 'SKILL.md'), '---\nname: [unterminated\n---\n');

    const manager = new SkillManager();

    await manager.scanAll(projectDir, ['.agents/skills']);

    expect(manager.getInventory()).toHaveLength(0);
    const projectSkills = manager.getProjectSkills();
    expect(projectSkills).toHaveLength(1);
    expect(projectSkills[0].name).toBe('broken-project');
    expect(projectSkills[0].actions).toEqual([]);
    expect(projectSkills[0].healthSignals.map((signal) => signal.code)).toContain('invalid-skill-md');
  });
});
