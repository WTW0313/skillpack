import { Box, Text } from 'ink';
import type { Skill } from '@skillpack/core';
import { fitCell, formatInventoryStatus, getGlyphSet, type InventoryLayout } from '../lib/responsive-layout.js';

export const COL_NAME_WIDTH = 30;
export const COL_AGENT_WIDTH = 10;

interface SkillRowProps {
  skill: Skill;
  isSelected: boolean;
  isDuplicate: boolean;
  columns?: InventoryLayout['columns'];
  statusVariant?: 'full' | 'compact';
}

export function SkillRow({
  skill,
  isSelected,
  isDuplicate,
  columns = { name: COL_NAME_WIDTH, provider: COL_AGENT_WIDTH, status: 8 },
  statusVariant = 'full',
}: SkillRowProps) {
  const statusLabel = formatInventoryStatus(skill.enabled, statusVariant);
  const statusColor = skill.enabled ? 'green' : undefined;
  const glyphs = getGlyphSet();

  return (
    <Box gap={1}>
      <Text color={isSelected ? 'magenta' : undefined}>
        {isSelected ? glyphs.selected : ' '}
      </Text>
      <Text
        color={isSelected ? 'white' : (skill.enabled ? undefined : 'gray')}
        bold={isSelected}
        dimColor={!skill.enabled && !isSelected}
      >
        {fitCell(skill.name, columns.name)}
      </Text>
      <Text dimColor>{fitCell(skill.provider, columns.provider)}</Text>
      <Text color={statusColor} dimColor={!skill.enabled}>
        {fitCell(statusLabel, columns.status)}
      </Text>
      {isDuplicate && <Text color="yellow">{glyphs.warning}</Text>}
    </Box>
  );
}
