import { Box, Text } from 'ink';
import { useAppContext } from '../context/app-context.js';

interface Shortcut {
  key: string;
  label: string;
}

const SHORTCUTS: Record<string, Shortcut[]> = {
  list: [
    { key: '↑↓', label: 'navigate' },
    { key: 'space', label: 'toggle when supported' },
    { key: 'enter', label: 'detail' },
    { key: '/', label: 'search' },
    { key: 'tab', label: 'tabs' },
    { key: 'p', label: 'project' },
    { key: 'u', label: 'updates' },
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
  updates: [
    { key: 'esc', label: 'back' },
    { key: 'enter', label: 'check/apply' },
    { key: 'r', label: 'recheck' },
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
];

export function StatusBar() {
  const { view, selectedSkill, manager } = useAppContext();

  let shortcuts: Shortcut[];
  if (view === 'detail') {
    const sourceType = selectedSkill?.source?.type;
    const isUpdatable = sourceType === 'skillssh';
    const isRemovable = selectedSkill?.provider === 'global' && sourceType === 'skillssh';
    const canToggle = selectedSkill
      ? manager.getProvider(selectedSkill.provider)?.capabilities.canToggle ?? false
      : false;
    const detailBase = canToggle
      ? [...DETAIL_BASE]
      : DETAIL_BASE.filter((shortcut) => shortcut.key !== 'space');
    const tail = isRemovable ? [...DETAIL_TAIL, { key: 'd', label: 'delete' }] : DETAIL_TAIL;
    shortcuts = isUpdatable
      ? [...detailBase, { key: 'u', label: 'check update' }, ...tail]
      : [...detailBase, ...tail];
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
