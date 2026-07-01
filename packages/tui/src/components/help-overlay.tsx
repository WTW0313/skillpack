import { Box, Text } from 'ink';
import { useAppContext } from '../context/app-context.js';
import { getShortcutsForView } from '../lib/shortcuts.js';

interface HelpOverlayProps {
  onClose: () => void;
}

function formatViewTitle(view: string): string {
  if (view === 'list') return 'Inventory';
  if (view === 'project') return 'Project Skills';
  return view[0].toUpperCase() + view.slice(1);
}

export function HelpOverlay(_props: HelpOverlayProps) {
  const { view, selectedSkill, manager } = useAppContext();
  const canToggle = selectedSkill
    ? Boolean(manager.getProvider(selectedSkill.provider)?.getDisableStrategy(selectedSkill))
    : false;
  const shortcuts = getShortcutsForView({ view, selectedSkill, canToggle });

  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      <Box>
        <Text dimColor>‹ esc/?  </Text>
        <Text bold color="magenta">{formatViewTitle(view)} Help</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {shortcuts.map((shortcut) => (
          <Box key={shortcut.key} gap={1}>
            <Text bold>{shortcut.key.padEnd(8)}</Text>
            <Text>{shortcut.label}</Text>
          </Box>
        ))}
      </Box>

      <Box flexGrow={1} />
      <Text dimColor>esc or ? to close</Text>
    </Box>
  );
}
