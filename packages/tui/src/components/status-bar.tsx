import { Box, Text } from 'ink';
import { useAppContext } from '../context/app-context.js';

export function StatusBar() {
  const { view } = useAppContext();

  const shortcuts: Record<string, string> = {
    list: '↑↓:navigate  Tab:switch  /:search  Enter:detail  i:install  c:create  u:updates  q:quit',
    detail: 'Esc:back  e:edit  d:delete  f:fork',
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
