import type { Skill } from '@skillpack/core';

type PluginToggleSkill = Pick<Skill, 'name' | 'provider' | 'origin'>;

export function isPluginOwnedSkill<T extends PluginToggleSkill | null | undefined>(
  skill: T,
): skill is NonNullable<T> & { origin: NonNullable<Skill['origin']> } {
  return skill?.origin?.type === 'plugin';
}

export function getAffectedPluginSkills<T extends PluginToggleSkill>(skills: T[], skill: PluginToggleSkill): T[] {
  if (!isPluginOwnedSkill(skill)) return [];
  return skills
    .filter((candidate) => (
      candidate.provider === skill.provider
      && candidate.origin?.type === 'plugin'
      && candidate.origin.pluginId === skill.origin.pluginId
    ))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function formatPluginToggleMessage<T extends PluginToggleSkill>(skill: PluginToggleSkill, skills: T[]): string {
  if (!isPluginOwnedSkill(skill)) return '';
  const action = skill.origin.pluginEnabled ? 'Disable' : 'Enable';
  const affected = getAffectedPluginSkills(skills, skill);
  const names = affected.map((item) => item.name).join(', ');
  const count = affected.length;
  return `${action} plugin ${skill.origin.pluginId}? This affects ${count} Codex skill${count === 1 ? '' : 's'}: ${names}.`;
}
