import { useMemo, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { useAppContext } from '../context/app-context.js';
import { useTerminalSize } from '../hooks/use-terminal-size.js';
import { StatusBar } from '../components/status-bar.js';
import { formatDisplayPath } from '../lib/format-path.js';

const CHROME_LINES = 5;
const NAME_WIDTH = 30;
const PATH_WIDTH = 54;

function truncate(value: string, max: number): string {
  if (value.length <= max) return value.padEnd(max);
  return value.slice(0, max - 1) + '…';
}

export function ProjectSkillsView() {
  const { exit } = useApp();
  const { projectSkills, setView } = useAppContext();
  const { rows } = useTerminalSize();
  const [cursor, setCursor] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  const visibleRows = Math.max(1, rows - CHROME_LINES);

  useInput((input, key) => {
    if (input === 'q') { exit(); return; }
    if (key.escape) { setView('list'); return; }
    if (key.downArrow) {
      setCursor((c) => Math.min(c + 1, projectSkills.length - 1));
      setScrollOffset((offset) => {
        const next = Math.min(cursor + 1, projectSkills.length - 1);
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
          <Text dimColor>{'NAME'.padEnd(NAME_WIDTH)}</Text>
          <Text dimColor>{'PROJECT PATH'.padEnd(PATH_WIDTH)}</Text>
          <Text dimColor>STATE</Text>
        </Box>
      </Box>

      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {projectSkills.length === 0 ? (
          <Box marginTop={1}>
            <Text dimColor>  No Project Skills found for this repository.</Text>
          </Box>
        ) : (
          visibleSkills.map((skill, index) => {
            const selected = scrollOffset + index === cursor;
            const hasIssues = skill.healthSignals.length > 0;
            return (
              <Box key={skill.path} gap={1}>
                <Text color={selected ? 'magenta' : undefined}>
                  {selected ? '❯' : ' '}
                </Text>
                <Text bold={selected} color={selected ? 'white' : undefined}>
                  {truncate(skill.name, NAME_WIDTH)}
                </Text>
                <Text dimColor>{truncate(formatDisplayPath(skill.path), PATH_WIDTH)}</Text>
                <Text color={hasIssues ? 'yellow' : 'green'}>
                  {hasIssues ? 'needs attention' : 'read-only'}
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
