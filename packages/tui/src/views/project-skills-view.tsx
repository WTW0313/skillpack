import { useMemo, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { useAppContext } from '../context/app-context.js';
import { useTerminalSize } from '../hooks/use-terminal-size.js';
import { StatusBar } from '../components/status-bar.js';
import { formatDisplayPath } from '../lib/format-path.js';
import { fitCell, getBoundedContentLayout, getGlyphSet, getProjectSkillsColumns } from '../lib/responsive-layout.js';

export function ProjectSkillsView() {
  const { exit } = useApp();
  const { projectSkills, inventory, setView } = useAppContext();
  const { columns, rows } = useTerminalSize();
  const [cursor, setCursor] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const glyphs = getGlyphSet();

  const layout = getBoundedContentLayout({
    size: { columns, rows },
    fullChromeLines: 5,
    compactChromeLines: 4,
  });
  const tableColumns = getProjectSkillsColumns({ columns, rows });
  const visibleRows = layout.visibleRows;

  useInput((input, key) => {
    if (input === 'q') { exit(); return; }
    if (key.escape) { setView('list'); return; }
    if (key.downArrow) {
      setCursor((c) => Math.min(c + 1, Math.max(0, projectSkills.length - 1)));
      setScrollOffset((offset) => {
        const next = Math.min(cursor + 1, Math.max(0, projectSkills.length - 1));
        return next >= offset + visibleRows ? next - visibleRows + 1 : offset;
      });
    }
    if (key.upArrow) {
      setCursor((c) => Math.max(c - 1, 0));
      setScrollOffset((offset) => {
        const next = Math.max(cursor - 1, 0);
        return next < offset ? next : offset;
      });
    }
  });

  const visibleSkills = useMemo(
    () => projectSkills.slice(scrollOffset, scrollOffset + visibleRows),
    [projectSkills, scrollOffset, visibleRows],
  );
  const showScroll = projectSkills.length > visibleRows;
  const inventoryNames = useMemo(
    () => new Set(inventory.map((group) => group.name.toLowerCase())),
    [inventory],
  );

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box paddingX={1}>
        <Text dimColor>‹ esc  </Text>
        <Text bold color="magenta">Project Skills</Text>
        <Text dimColor>  {projectSkills.length} skill{projectSkills.length !== 1 ? 's' : ''}</Text>
        {showScroll && (
          <Text dimColor>  {scrollOffset + 1}–{Math.min(scrollOffset + visibleRows, projectSkills.length)} of {projectSkills.length}</Text>
        )}
      </Box>

      <Box paddingX={1} marginTop={1}>
        <Box gap={1}>
          <Text>{' '}</Text>
          <Text dimColor>{fitCell('NAME', tableColumns.name)}</Text>
          {tableColumns.description > 0 && <Text dimColor>{fitCell('DESCRIPTION', tableColumns.description)}</Text>}
          <Text dimColor>{fitCell('PROJECT PATH', tableColumns.path)}</Text>
          <Text dimColor>{fitCell('STATE', tableColumns.state)}</Text>
        </Box>
      </Box>

      <Box flexDirection="column" paddingX={1} height={visibleRows}>
        {projectSkills.length === 0 ? (
          <Box marginTop={1}>
            <Text dimColor>  No Project Skills found for this repository.</Text>
          </Box>
        ) : (
          visibleSkills.map((skill, index) => {
            const selected = scrollOffset + index === cursor;
            const hasIssues = skill.healthSignals.length > 0;
            const overlapsInventory = inventoryNames.has(skill.name.toLowerCase());
            const state = hasIssues ? 'needs attention' : overlapsInventory ? 'overlaps' : 'read-only';
            return (
              <Box key={skill.path} gap={1}>
                <Text color={selected ? 'magenta' : undefined}>
                  {selected ? glyphs.selected : ' '}
                </Text>
                <Text bold={selected} color={selected ? 'white' : undefined}>
                  {fitCell(skill.name, tableColumns.name)}
                </Text>
                {tableColumns.description > 0 && (
                  <Text dimColor>{fitCell(skill.description || '-', tableColumns.description)}</Text>
                )}
                <Text dimColor>{fitCell(formatDisplayPath(skill.path), tableColumns.path)}</Text>
                <Text color={hasIssues || overlapsInventory ? 'yellow' : 'green'}>
                  {fitCell(state, tableColumns.state)}
                </Text>
              </Box>
            );
          })
        )}
      </Box>

      <Box flexGrow={1} />
      <StatusBar />
    </Box>
  );
}
