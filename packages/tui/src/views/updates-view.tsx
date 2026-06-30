import { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Spinner } from '@inkjs/ui';
import { useAppContext } from '../context/app-context.js';
import { StatusBar } from '../components/status-bar.js';
import type { Skill, UpdateInfo } from '@skillpack/core';

type UpdatesState = 'idle' | 'checking' | 'checked' | 'updating';

interface UpdateRow {
  skill: Skill;
  update: UpdateInfo;
}

export function UpdatesView() {
  const { exit } = useApp();
  const { manager, refresh, setView } = useAppContext();
  const [state, setState] = useState<UpdatesState>('idle');
  const [updates, setUpdates] = useState<UpdateRow[]>([]);
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState('');

  const runCheck = async () => {
    setError('');
    setState('checking');
    try {
      const found = await manager.checkUpdates();
      setUpdates(found);
      setCursor(0);
      setState('checked');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('idle');
    }
  };

  const applySelected = async () => {
    const selected = updates[cursor];
    if (!selected) return;
    setError('');
    setState('updating');
    try {
      await manager.updateSkill(selected.skill);
      await refresh();
      await runCheck();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('checked');
    }
  };

  useInput((input, key) => {
    if (input === 'q') { exit(); return; }
    if (key.escape) { setView('list'); return; }
    if (state === 'checking' || state === 'updating') return;
    if (input === 'r') {
      void runCheck();
      return;
    }
    if (key.return) {
      if (state === 'idle') {
        void runCheck();
      } else {
        void applySelected();
      }
      return;
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(c + 1, updates.length - 1));
    }
    if (key.upArrow) {
      setCursor((c) => Math.max(c - 1, 0));
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      <Box>
        <Text dimColor>‹ esc  </Text>
        <Text bold color="magenta">Updates</Text>
      </Box>

      {error !== '' && (
        <Box marginTop={1}>
          <Text color="red">✗ {error}</Text>
        </Box>
      )}

      {state === 'idle' && (
        <Box marginTop={1}>
          <Text dimColor>Not checked. Press </Text>
          <Text bold>enter</Text>
          <Text dimColor> to check skills.sh-managed Global Skills.</Text>
        </Box>
      )}

      {state === 'checking' && (
        <Box marginTop={1}>
          <Spinner label="Checking skills.sh updates…" />
        </Box>
      )}

      {state === 'updating' && (
        <Box marginTop={1}>
          <Spinner label="Updating selected Global Skill…" />
        </Box>
      )}

      {state === 'checked' && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>{updates.length} update{updates.length !== 1 ? 's' : ''} available</Text>
          <Box flexDirection="column" marginTop={1}>
            {updates.length === 0 ? (
              <Text dimColor>No skills.sh updates found. Press r to check again.</Text>
            ) : (
              updates.map((row, index) => {
                const selected = index === cursor;
                return (
                  <Box key={`${row.skill.provider}:${row.skill.name}`} gap={1}>
                    <Text color={selected ? 'magenta' : undefined}>{selected ? '❯' : ' '}</Text>
                    <Text bold={selected} color={selected ? 'white' : undefined}>{row.skill.name}</Text>
                    <Text dimColor>{row.update.currentVersion ?? '?'}</Text>
                    <Text dimColor>→</Text>
                    <Text color="green">{row.update.latestVersion ?? 'latest'}</Text>
                  </Box>
                );
              })
            )}
          </Box>
        </Box>
      )}

      <Box flexGrow={1} />
      <StatusBar />
    </Box>
  );
}
