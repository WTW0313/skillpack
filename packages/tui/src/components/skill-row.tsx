import { Box, Text } from 'ink';
import type { Skill } from '@skillpack/core';

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
        {skill.name.padEnd(30)}
      </Text>
      <Text dimColor>{skill.provider.padEnd(10)}</Text>
      <Text color={skill.enabled ? 'green' : 'red'}>
        {skill.enabled ? 'on' : 'off'}
      </Text>
      {skill.readonly && <Text dimColor> [ro]</Text>}
      {isConflicting && <Text color="yellow"> ! conflict</Text>}
    </Box>
  );
}
