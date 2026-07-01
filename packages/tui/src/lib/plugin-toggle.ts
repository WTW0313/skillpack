import type { Skill } from '@skillpack/core';

export function isPluginOwnedSkill(skill: Skill | null | undefined): skill is Skill & { origin: NonNullable<Skill['origin']> } {
  return skill?.origin?.type === 'plugin';
}

export function getAffectedPluginSkills(skills: Skill[], skill: Skill): Skill[] {
  if (!isPluginOwnedSkill(skill)) return [];
  return skills
    .filter((candidate) => (
      candidate.provider === skill.provider
      && candidate.origin?.type === 'plugin'
      && candidate.origin.pluginId === skill.origin.pluginId
    ))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function formatPluginToggleMessage(skill: Skill, skills: Skill[]): string {
  if (!isPluginOwnedSkill(skill)) return '';
  const action = skill.origin.pluginEnabled ? 'Disable' : 'Enable';
  const affected = getAffectedPluginSkills(skills, skill);
  const names = affected.map((item) => item.name).join(', ');
  const count = affected.length;
  return `${action} plugin ${skill.origin.pluginId}? This affects ${count} Codex skill${count === 1 ? '' : 's'}: ${names}.`;
}
