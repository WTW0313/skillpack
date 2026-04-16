import { Box, Text } from 'ink';
import { useAppContext } from '../context/app-context.js';

interface Shortcut {
  key: string;
  label: string;
}

const SHORTCUTS: Record<string, Shortcut[]> = {
  list: [
    { key: '↑↓', label: 'navigate' },
    { key: 'space', label: 'toggle' },
    { key: 'enter', label: 'detail' },
    { key: '/', label: 'search' },
    { key: 'tab', label: 'tabs' },
    { key: 'i', label: 'install' },
    { key: 'c', label: 'create' },
    { key: 'u', label: 'updates' },
    { key: 'q', label: 'quit' },
  ],
  install: [
    { key: 'esc', label: 'back' },
    { key: '↑↓', label: 'navigate' },
    { key: 'enter', label: 'select' },
  ],
  create: [
    { key: 'esc', label: 'back' },
    { key: 'enter', label: 'confirm' },
  ],
  update: [
    { key: 'esc', label: 'back' },
    { key: '↑↓', label: 'navigate' },
  ],
};

const DETAIL_SHORTCUTS: Shortcut[] = [
  { key: 'esc', label: 'back' },
  { key: 'space', label: 'toggle' },
  { key: 'e', label: 'edit' },
  { key: 'o', label: 'open folder' },
  { key: 'd', label: 'delete' },
];

export function StatusBar() {
  const { view } = useAppContext();
  const shortcuts = view === 'detail' ? DETAIL_SHORTCUTS : (SHORTCUTS[view] ?? []);

  return (
    <Box paddingX={1} paddingY={0}>
      <Text dimColor>{'─'.repeat(2)} </Text>
      {shortcuts.map((s, i) => (
        <Text key={s.key}>
          {i > 0 && <Text dimColor>  </Text>}
          <Text color="white" bold>{s.key}</Text>
          <Text dimColor> {s.label}</Text>
        </Text>
      ))}
    </Box>
  );
}
