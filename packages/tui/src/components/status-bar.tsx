import { Box, Text } from 'ink';
import { useAppContext } from '../context/app-context.js';

export function StatusBar() {
  const { view } = useAppContext();

  const shortcuts: Record<string, string> = {
    list: 'j/k:navigate  Tab:switch  /:search  Enter:detail  i:install  c:create  u:updates  q:quit',
    detail: 'Esc:back  e:edit  d:delete',
    install: 'Esc:back  j/k:navigate  Enter:select',
    create: 'Esc:back  Enter:confirm',
    update: 'Esc:back  j/k:navigate',
  };

  return (
    <Box borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} paddingX={1}>
      <Text dimColor>{shortcuts[view] ?? ''}</Text>
    </Box>
  );
}
