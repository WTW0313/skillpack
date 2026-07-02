import { Box, Text } from 'ink';
import type { SkillGroup } from '@skillpack/core';
import { fitCell, getGlyphSet, type InventoryLayout } from '../lib/responsive-layout.js';

export const COL_NAME_WIDTH = 30;
export const COL_AGENT_WIDTH = 10;

interface SkillRowProps {
  skill: SkillGroup;
  isSelected: boolean;
  columns?: InventoryLayout['columns'];
}

export function SkillRow({
  skill,
  isSelected,
  columns = { name: COL_NAME_WIDTH, provider: COL_AGENT_WIDTH, status: 8 },
}: SkillRowProps) {
  const glyphs = getGlyphSet();
  const providerLabel = skill.providers
    .map((provider) => `${provider.provider}:${provider.enabled ? 'on' : 'off'}`)
    .join(' ');
  const healthLabel = skill.healthSignals.length === 0
    ? 'ok'
    : [...new Set(skill.healthSignals.map((signal) => signal.code.replace(/-/g, ' ')))].join(', ');
  const hasWarnings = skill.healthSignals.length > 0;

  return (
    <Box gap={1}>
      <Text color={isSelected ? 'magenta' : undefined}>
        {isSelected ? glyphs.selected : ' '}
      </Text>
      <Text
        color={isSelected ? 'white' : undefined}
        bold={isSelected}
      >
        {fitCell(skill.name, columns.name)}
      </Text>
      <Text dimColor>{fitCell(providerLabel, columns.provider)}</Text>
      <Text color={hasWarnings ? 'yellow' : 'green'}>
        {fitCell(healthLabel, columns.status)}
      </Text>
      {hasWarnings && <Text color="yellow">{glyphs.warning}</Text>}
    </Box>
  );
}
