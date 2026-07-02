import { Box, Text } from 'ink';
import { useAppContext } from '../context/app-context.js';
import { useTerminalSize } from '../hooks/use-terminal-size.js';
import { getVisibleShortcuts } from '../lib/responsive-layout.js';
import { getShortcutsForView } from '../lib/shortcuts.js';

export function StatusBar() {
  const { view, selectedSkill } = useAppContext();
  const { columns, rows } = useTerminalSize();
  const canToggle = selectedSkill?.actions.some((action) => action === 'enable' || action === 'disable') ?? false;
  const shortcuts = getShortcutsForView({ view, selectedSkill, canToggle });
  const visibleShortcuts = getVisibleShortcuts(shortcuts, { columns, rows });

  return (
    <Box paddingX={1} paddingY={0}>
      <Text dimColor>{'─'.repeat(2)} </Text>
      {visibleShortcuts.map((s, i) => (
        <Text key={s.key}>
          {i > 0 && <Text dimColor>  </Text>}
          <Text color="white" bold>{s.key}</Text>
          <Text dimColor> {s.displayLabel}</Text>
        </Text>
      ))}
    </Box>
  );
}
