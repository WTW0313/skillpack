import { Box, Text } from 'ink';
import type { Skill } from '@skillpack/core';

export const COL_NAME_WIDTH = 30;
export const COL_AGENT_WIDTH = 10;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s.padEnd(max);
  return s.slice(0, max - 1) + '…';
}

interface SkillRowProps {
  skill: Skill;
  isSelected: boolean;
  isConflicting: boolean;
}

export function SkillRow({ skill, isSelected, isConflicting }: SkillRowProps) {
  const statusIcon = skill.enabled ? '●' : '○';
  const statusColor = skill.enabled ? 'green' : undefined;

  return (
    <Box gap={1}>
      <Text color={isSelected ? 'magenta' : undefined}>
        {isSelected ? '❯' : ' '}
      </Text>
      <Text
        color={isSelected ? 'white' : (skill.enabled ? undefined : 'gray')}
        bold={isSelected}
        dimColor={!skill.enabled && !isSelected}
      >
        {truncate(skill.name, COL_NAME_WIDTH)}
      </Text>
      <Text dimColor>{truncate(skill.provider, COL_AGENT_WIDTH)}</Text>
      <Text color={statusColor} dimColor={!skill.enabled}>
        {statusIcon}
      </Text>
      {isConflicting && <Text color="yellow">⚠</Text>}
    </Box>
  );
}
