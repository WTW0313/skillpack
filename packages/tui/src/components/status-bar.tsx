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
    { key: 'p', label: 'project' },
    { key: 'i', label: 'install' },
    { key: 'q', label: 'quit' },
  ],
  install: [
    { key: 'esc', label: 'back' },
    { key: '↑↓', label: 'navigate' },
    { key: 'enter', label: 'select' },
  ],
  project: [
    { key: 'esc', label: 'back' },
    { key: '↑↓', label: 'navigate' },
    { key: 'q', label: 'quit' },
  ],
};

const DETAIL_BASE: Shortcut[] = [
  { key: 'esc', label: 'back' },
  { key: 'space', label: 'toggle' },
];

const DETAIL_TAIL: Shortcut[] = [
  { key: 'o', label: 'open folder' },
  { key: 'd', label: 'delete' },
];

export function StatusBar() {
  const { view, selectedSkill } = useAppContext();

  let shortcuts: Shortcut[];
  if (view === 'detail') {
    const sourceType = selectedSkill?.source?.type;
    const isUpdatable = sourceType === 'skillssh';
    shortcuts = isUpdatable
      ? [...DETAIL_BASE, { key: 'u', label: 'check update' }, ...DETAIL_TAIL]
      : [...DETAIL_BASE, ...DETAIL_TAIL];
  } else {
    shortcuts = SHORTCUTS[view] ?? [];
  }

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
