import { Box, Text } from 'ink';
import type { Skill } from '@skillpack/core';

export const COL_NAME_WIDTH = 28;
export const COL_PROVIDER_WIDTH = 10;

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
  return (
    <Box gap={1}>
      <Text color={isSelected ? 'cyan' : undefined}>
        {isSelected ? '>' : ' '}
      </Text>
      <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
        {truncate(skill.name, COL_NAME_WIDTH)}
      </Text>
      <Text dimColor>{skill.provider.padEnd(COL_PROVIDER_WIDTH)}</Text>
      <Text color={skill.enabled ? 'green' : 'red'}>
        {skill.enabled ? 'on' : 'off'}
      </Text>
      {isConflicting && <Text color="yellow"> !</Text>}
    </Box>
  );
}
