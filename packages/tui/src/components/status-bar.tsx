import { Box, Text } from 'ink';
import { useAppContext } from '../context/app-context.js';

export function StatusBar() {
  const { view, selectedSkill } = useAppContext();

  const detailToggle = selectedSkill ? (selectedSkill.enabled ? 'Space:disable' : 'Space:enable') : 'Space:toggle';

  const shortcuts: Record<string, string> = {
    list: '↑↓:navigate  Space:toggle  Tab:switch  /:search  Enter:detail  i:install  c:create  u:updates  q:quit',
    detail: `Esc:back  ${detailToggle}  e:edit  d:delete  f:fork`,
    install: 'Esc:back  ↑↓:navigate  Enter:select',
    create: 'Esc:back  Enter:confirm',
    update: 'Esc:back  ↑↓:navigate',
  };

  return (
    <Box borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} paddingX={1}>
      <Text dimColor>{shortcuts[view] ?? ''}</Text>
    </Box>
  );
}
