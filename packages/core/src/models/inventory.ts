import type { Skill, SkillSource } from './skill.js';

export type SkillIdentityConfidence = 'confirmed' | 'inferred';

export type HealthSignalCode =
  | 'grouped-across-providers'
  | 'inferred-identity'
  | 'invalid-skill-md'
  | 'broken-symlink'
  | 'unmanaged-global-skill'
  | 'update-available';

export interface HealthSignal {
  code: HealthSignalCode;
  message: string;
}

export type SkillAction = 'enable' | 'disable' | 'update' | 'remove';

export interface DisableStrategy {
  type: 'disabled-directory' | 'provider-config';
  description: string;
}

export interface SkillInventoryInstance {
  name: string;
  description: string;
  provider: string;
  path: string;
  resolvedPath?: string;
  version?: string;
  enabled: boolean;
  source?: SkillSource;
  disableStrategy?: DisableStrategy;
  actions: SkillAction[];
  healthSignals: HealthSignal[];
}

export interface SkillGroup {
  id: string;
  name: string;
  identity: {
    confidence: SkillIdentityConfidence;
    reasons: string[];
  };
  providers: Array<{
    provider: string;
    enabled: boolean;
  }>;
  instances: SkillInventoryInstance[];
  healthSignals: HealthSignal[];
}

export function normalizeSkillName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_]+/g, '-');
}

function strongIdentityFor(skill: Skill): { key: string; reason: string } | null {
  const realPath = skill.resolvedPath ?? skill.path;
  if (skill.resolvedPath) {
    return { key: `realpath:${realPath}`, reason: 'shared real path' };
  }
  if (skill.source?.type === 'skillssh' && (skill.source.skillFolderHash || skill.source.repo)) {
    return {
      key: `skillssh:${skill.source.skillFolderHash ?? skill.source.repo}`,
      reason: 'skills.sh provenance',
    };
  }
  return null;
}

function inferredIdentityFor(skill: Skill): { key: string; confidence: SkillIdentityConfidence; reason: string } {
  return {
    key: `name:${normalizeSkillName(skill.name)}`,
    confidence: 'inferred',
    reason: 'normalized name',
  };
}

function actionsFor(skill: Skill): SkillAction[] {
  const toggleAction: SkillAction = skill.enabled ? 'disable' : 'enable';
  if (skill.scope === 'project') return [];
  if (skill.provider === 'global' && skill.source?.type === 'skillssh') {
    return ['update', 'remove'];
  }
  if (skill.provider === 'global') return [];
  return [toggleAction];
}

function healthSignalsFor(skill: Skill): HealthSignal[] {
  const signals: HealthSignal[] = (skill.scanIssues ?? []).map((issue) => ({
    code: issue.code,
    message: issue.message,
  }));
  if (skill.provider === 'global' && skill.source?.type !== 'skillssh') {
    signals.push({ code: 'unmanaged-global-skill', message: 'Global Skill is not managed by skills.sh metadata' });
  }
  return signals;
}

export interface BuildSkillInventoryOptions {
  getDisableStrategy?: (skill: Skill) => DisableStrategy | undefined;
}

function toInstance(skill: Skill, options: BuildSkillInventoryOptions): SkillInventoryInstance {
  return {
    name: skill.name,
    description: skill.description,
    provider: skill.provider,
    path: skill.path,
    resolvedPath: skill.resolvedPath,
    version: skill.version,
    enabled: skill.enabled,
    source: skill.source,
    disableStrategy: options.getDisableStrategy?.(skill),
    actions: actionsFor(skill),
    healthSignals: healthSignalsFor(skill),
  };
}

export function buildSkillInventory(skills: Skill[], options: BuildSkillInventoryOptions = {}): SkillGroup[] {
  const inventorySkills = skills.filter((s) => s.scope !== 'project');
  const strongGroups = new Map<string, { reason: string; skills: Skill[] }>();
  for (const skill of inventorySkills) {
    const identity = strongIdentityFor(skill);
    if (!identity) continue;
    const existing = strongGroups.get(identity.key);
    if (existing) {
      existing.skills.push(skill);
    } else {
      strongGroups.set(identity.key, { reason: identity.reason, skills: [skill] });
    }
  }

  const assigned = new Set<Skill>();
  const groups = new Map<string, { identity: { confidence: SkillIdentityConfidence; reason: string }; skills: Skill[] }>();
  for (const [key, group] of strongGroups) {
    if (group.skills.length < 2) continue;
    for (const skill of group.skills) assigned.add(skill);
    groups.set(key, { identity: { confidence: 'confirmed', reason: group.reason }, skills: group.skills });
  }

  for (const skill of inventorySkills) {
    if (assigned.has(skill)) continue;
    const identity = inferredIdentityFor(skill);
    const existing = groups.get(identity.key);
    if (existing) {
      existing.skills.push(skill);
    } else {
      groups.set(identity.key, { identity, skills: [skill] });
    }
  }

  return [...groups.entries()].map(([id, group]) => {
    const instances = group.skills.map((skill) => toInstance(skill, options));
    const healthSignals = instances.flatMap((instance) => instance.healthSignals);
    if (instances.length > 1) {
      healthSignals.push({
        code: 'grouped-across-providers',
        message: 'Skill appears in multiple providers',
      });
    }
    if (group.identity.confidence === 'inferred') {
      healthSignals.push({
        code: 'inferred-identity',
        message: 'Skill identity is inferred from normalized name',
      });
    }

    return {
      id,
      name: group.skills[0].name,
      identity: {
        confidence: group.identity.confidence,
        reasons: [group.identity.reason],
      },
      providers: instances.map((instance) => ({
        provider: instance.provider,
        enabled: instance.enabled,
      })),
      instances,
      healthSignals,
    };
  });
}
