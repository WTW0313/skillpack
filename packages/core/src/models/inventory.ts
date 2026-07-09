import type { Skill, SkillSource } from './skill.js';

export type SkillIdentityConfidence = 'confirmed' | 'inferred';

export type InventoryIssueCode =
  | 'invalid-skill-md'
  | 'broken-symlink'
  | 'plugin-identity-mismatch';

export type InventoryNoticeCode =
  | 'related-providers'
  | 'name-only-relationship'
  | 'unmanaged-global-skill'
  | 'update-available';

export interface InventoryIssue {
  code: InventoryIssueCode;
  message: string;
}

export interface InventoryNotice {
  code: InventoryNoticeCode;
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
  origin?: Skill['origin'];
  source?: SkillSource;
  disableStrategy?: DisableStrategy;
  actions: SkillAction[];
  issues: InventoryIssue[];
  notices: InventoryNotice[];
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
  issues: InventoryIssue[];
  notices: InventoryNotice[];
}

export function normalizeSkillName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_]+/g, '-');
}

function strongIdentityFor(skill: Skill): { key: string; reason: string; confirmsSingleInstance: boolean } | null {
  const realPath = skill.resolvedPath ?? skill.path;
  if (skill.source?.type === 'skillssh' && (skill.source.skillFolderHash || skill.source.repo)) {
    const sourceKey = skill.source.skillFolderHash
      ? `hash:${skill.source.skillFolderHash}`
      : `repo:${skill.source.repo}:skill:${normalizeSkillName(skill.name)}`;
    return {
      key: `skillssh:${sourceKey}`,
      reason: 'skills.sh provenance',
      confirmsSingleInstance: true,
    };
  }
  if (skill.resolvedPath) {
    return { key: `realpath:${realPath}`, reason: 'shared real path', confirmsSingleInstance: false };
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

function actionsFor(skill: Skill, disableStrategy: DisableStrategy | undefined): SkillAction[] {
  const toggleState = skill.origin?.type === 'plugin' ? skill.origin.pluginEnabled : skill.enabled;
  const toggleAction: SkillAction = toggleState ? 'disable' : 'enable';
  if (skill.scope === 'project') return [];
  if (skill.provider === 'global' && skill.source?.type === 'skillssh') {
    return ['update', 'remove'];
  }
  if (skill.provider === 'global') return [];
  return disableStrategy ? [toggleAction] : [];
}

function issuesFor(skill: Skill): InventoryIssue[] {
  return (skill.scanIssues ?? []).map((issue) => ({
    code: issue.code,
    message: issue.message,
  }));
}

function noticesFor(skill: Skill, options: BuildSkillInventoryOptions): InventoryNotice[] {
  const notices: InventoryNotice[] = [];
  if (skill.provider === 'global' && skill.source?.type !== 'skillssh') {
    notices.push({ code: 'unmanaged-global-skill', message: 'Global Skill is not managed by skills.sh metadata' });
  }
  if (options.hasUpdate?.(skill)) {
    notices.push({ code: 'update-available', message: 'skills.sh update is available' });
  }
  return notices;
}

export interface BuildSkillInventoryOptions {
  getDisableStrategy?: (skill: Skill) => DisableStrategy | undefined;
  hasUpdate?: (skill: Skill) => boolean;
}

function toInstance(skill: Skill, options: BuildSkillInventoryOptions): SkillInventoryInstance {
  const disableStrategy = options.getDisableStrategy?.(skill);
  return {
    name: skill.name,
    description: skill.description,
    provider: skill.provider,
    path: skill.path,
    resolvedPath: skill.resolvedPath,
    version: skill.version,
    enabled: skill.enabled,
    origin: skill.origin,
    source: skill.source,
    disableStrategy,
    actions: actionsFor(skill, disableStrategy),
    issues: issuesFor(skill),
    notices: noticesFor(skill, options),
  };
}

export function buildSkillInventory(skills: Skill[], options: BuildSkillInventoryOptions = {}): SkillGroup[] {
  const inventorySkills = skills.filter((s) => s.scope !== 'project');
  const strongGroups = new Map<string, { reason: string; confirmsSingleInstance: boolean; skills: Skill[] }>();
  for (const skill of inventorySkills) {
    const identity = strongIdentityFor(skill);
    if (!identity) continue;
    const existing = strongGroups.get(identity.key);
    if (existing) {
      existing.skills.push(skill);
    } else {
      strongGroups.set(identity.key, {
        reason: identity.reason,
        confirmsSingleInstance: identity.confirmsSingleInstance,
        skills: [skill],
      });
    }
  }

  const assigned = new Set<Skill>();
  const groups = new Map<string, { identity: { confidence: SkillIdentityConfidence; reason: string }; skills: Skill[] }>();
  for (const [key, group] of strongGroups) {
    if (group.skills.length < 2 && !group.confirmsSingleInstance) continue;
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
    const notices: InventoryNotice[] = [];
    if (instances.length > 1) {
      notices.push({
        code: group.identity.confidence === 'confirmed' ? 'related-providers' : 'name-only-relationship',
        message: group.identity.confidence === 'confirmed'
          ? 'Skill has confirmed related provider instances'
          : 'Skill has same-name provider instances without confirming provenance',
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
      issues: instances.flatMap((instance) => instance.issues),
      notices,
    };
  });
}
