import { Box, Text } from 'ink';
import type { InventoryListRow } from '../hooks/use-skills.js';
import {
  fitCell,
  formatInventoryStatus,
  getGlyphSet,
  type InventoryLayout,
} from '../lib/responsive-layout.js';

export const COL_NAME_WIDTH = 30;
export const COL_AGENT_WIDTH = 10;

interface SkillRowProps {
  skill: InventoryListRow;
  isSelected: boolean;
  columns?: InventoryLayout['columns'];
}

export function SkillRow({
  skill,
  isSelected,
  columns = { name: COL_NAME_WIDTH, provider: COL_AGENT_WIDTH, state: 8, related: 14, issue: 10 },
}: SkillRowProps) {
  const glyphs = getGlyphSet();
  const stateLabel = formatInventoryStatus(skill.instance.enabled, columns.state <= 3 ? 'compact' : 'full');
  const relatedLabel = skill.relatedProviders.length > 0
    ? skill.relatedProviders.map((provider) => provider.provider).join(' ')
    : '-';
  const issueLabel = skill.issues.length > 0
    ? skill.issues[0].code.replace(/-/g, ' ')
    : '-';
  const hasIssues = skill.issues.length > 0;

  return (
    <Box gap={1}>
      <Text color={isSelected ? 'magenta' : undefined}>
        {isSelected ? glyphs.selected : ' '}
      </Text>
      <Text
        color={isSelected ? 'white' : undefined}
        bold={isSelected}
      >
        {fitCell(skill.instance.name, columns.name)}
      </Text>
      <Text dimColor>{fitCell(skill.instance.provider, columns.provider)}</Text>
      <Text color={skill.instance.enabled ? 'green' : undefined} dimColor={!skill.instance.enabled}>
        {stateLabel}
      </Text>
      <Text dimColor>{fitCell(relatedLabel, columns.related)}</Text>
      <Text color={hasIssues ? 'yellow' : undefined} dimColor={!hasIssues}>
        {fitCell(issueLabel, columns.issue)}
      </Text>
      {hasIssues && <Text color="yellow">{glyphs.warning}</Text>}
    </Box>
  );
}
