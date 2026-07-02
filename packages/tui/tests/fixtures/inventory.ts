import type {
  Skill,
  SkillGroup,
  SkillInventoryInstance,
  SkillpackConfig,
} from '@skillpack/core';

export function testConfig(overrides: Partial<SkillpackConfig> = {}): SkillpackConfig {
  return {
    editor: 'vi',
    autoCheckUpdates: false,
    projectSkillsDirs: ['.codex/skills', '.claude/skills', '.agents/skills'],
    providers: {
      codex: { enabled: true, paths: [] },
      claude: { enabled: true, paths: [] },
      global: { enabled: true, paths: [] },
    },
    sources: {
      skillssh: { enabled: true },
    },
    ...overrides,
  };
}

export function inventoryInstance(overrides: Partial<SkillInventoryInstance> = {}): SkillInventoryInstance {
  const provider = overrides.provider ?? 'codex';
  const name = overrides.name ?? 'alpha';

  return {
    name,
    description: `${name} test skill`,
    provider,
    path: `/tmp/skillpack/${provider}/${name}/SKILL.md`,
    enabled: true,
    source: { type: 'local' },
    actions: [],
    issues: [],
    notices: [],
    ...overrides,
  };
}

export function inventoryGroup(
  name: string,
  instances: SkillInventoryInstance[] = [inventoryInstance({ name })],
  overrides: Partial<SkillGroup> = {},
): SkillGroup {
  return {
    id: `name:${name}`,
    name,
    identity: {
      confidence: 'inferred',
      reasons: ['normalized name'],
    },
    providers: instances.map((instance) => ({
      provider: instance.provider,
      enabled: instance.enabled,
    })),
    instances,
    issues: instances.flatMap((instance) => instance.issues),
    notices: [],
    ...overrides,
  };
}

export function skillFromInstance(instance: SkillInventoryInstance): Skill {
  return {
    name: instance.name,
    description: instance.description,
    provider: instance.provider,
    path: instance.path,
    resolvedPath: instance.resolvedPath,
    version: instance.version,
    enabled: instance.enabled,
    scope: instance.provider === 'project' ? 'project' : 'global',
    metadata: {},
    origin: instance.origin,
    source: instance.source,
    scanIssues: instance.issues,
  };
}

export function skillsFromInventory(inventory: SkillGroup[]): Skill[] {
  return inventory.flatMap((group) => group.instances.map(skillFromInstance));
}

export function basicInventory(): SkillGroup[] {
  return [
    inventoryGroup('alpha', [
      inventoryInstance({
        name: 'alpha',
        provider: 'codex',
        description: 'Alpha helps with coding workflows.',
        actions: ['disable'],
        disableStrategy: {
          type: 'provider-config',
          description: 'Codex config entry',
        },
      }),
    ]),
    inventoryGroup('bravo', [
      inventoryInstance({
        name: 'bravo',
        provider: 'claude',
        description: 'Bravo helps with writing workflows.',
        enabled: false,
        actions: ['enable'],
        disableStrategy: {
          type: 'provider-config',
          description: 'Claude settings override',
        },
      }),
    ]),
    inventoryGroup('charlie', [
      inventoryInstance({
        name: 'charlie',
        provider: 'global',
        description: 'Charlie is managed by skills.sh.',
        version: '1.0.0',
        source: {
          type: 'skillssh',
          repo: 'owner/charlie',
          skillFolderHash: 'abc1234',
        },
        actions: ['update', 'remove'],
      }),
    ], {
      identity: {
        confidence: 'confirmed',
        reasons: ['skills.sh provenance'],
      },
    }),
  ];
}

export function emptyInventory(): SkillGroup[] {
  return [];
}
