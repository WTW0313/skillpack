import { useEffect, useMemo, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Spinner } from '@inkjs/ui';
import { useAppContext } from '../context/app-context.js';
import { StatusBar } from '../components/status-bar.js';
import { ConfirmDialog } from '../components/confirm-dialog.js';
import { useTerminalSize } from '../hooks/use-terminal-size.js';
import { fitCell, getBoundedContentLayout, getGlyphSet } from '../lib/responsive-layout.js';
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
  const [scrollOffset, setScrollOffset] = useState(0);
  const [error, setError] = useState('');
  const [confirmingUpdate, setConfirmingUpdate] = useState(false);
  const glyphs = getGlyphSet();
  const { columns, rows } = useTerminalSize();
  const layout = getBoundedContentLayout({
    size: { columns, rows },
    fullChromeLines: error ? 6 : 5,
    compactChromeLines: error ? 5 : 4,
  });
  const resultRows = Math.max(1, layout.visibleRows - 2);
  const resultNameWidth = Math.max(12, Math.min(30, columns - 24));

  useEffect(() => {
    if (cursor < scrollOffset) {
      setScrollOffset(cursor);
    } else if (cursor >= scrollOffset + resultRows) {
      setScrollOffset(cursor - resultRows + 1);
    }
  }, [cursor, resultRows, scrollOffset]);

  const visibleUpdates = useMemo(
    () => updates.slice(scrollOffset, scrollOffset + resultRows),
    [updates, scrollOffset, resultRows],
  );

  const runCheck = async () => {
    setError('');
    setState('checking');
    try {
      const found = await manager.checkUpdates();
      setUpdates(found);
      setCursor(0);
      setScrollOffset(0);
      setState('checked');
      await refresh();
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
    if (confirmingUpdate) return;
    if (state === 'checking' || state === 'updating') return;
    if (input === 'r') {
      void runCheck();
      return;
    }
    if (key.return) {
      if (state === 'idle') {
        void runCheck();
      } else if (updates[cursor]) {
        setConfirmingUpdate(true);
      }
      return;
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(c + 1, Math.max(0, updates.length - 1)));
    }
    if (key.upArrow) {
      setCursor((c) => Math.max(c - 1, 0));
    }
  });

  if (confirmingUpdate) {
    const selected = updates[cursor];
    return (
      <Box flexDirection="column" padding={1}>
        <ConfirmDialog
          message={`Update "${selected?.skill.name ?? 'selected skill'}" from ${selected?.update.currentVersion ?? '?'} to ${selected?.update.latestVersion ?? 'latest'}?`}
          onConfirm={() => {
            setConfirmingUpdate(false);
            void applySelected();
          }}
          onCancel={() => setConfirmingUpdate(false)}
        />
      </Box>
    );
  }

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
          <Box flexDirection="column" marginTop={1} height={resultRows}>
            {updates.length === 0 ? (
              <Text dimColor>No skills.sh updates found. Press r to check again.</Text>
            ) : (
              visibleUpdates.map((row, index) => {
                const absoluteIndex = scrollOffset + index;
                const selected = absoluteIndex === cursor;
                return (
                  <Box key={`${row.skill.provider}:${row.skill.name}`} gap={1}>
                    <Text color={selected ? 'magenta' : undefined}>{selected ? glyphs.selected : ' '}</Text>
                    <Text bold={selected} color={selected ? 'white' : undefined}>{fitCell(row.skill.name, resultNameWidth)}</Text>
                    <Text dimColor>{row.update.currentVersion ?? '?'}</Text>
                    <Text dimColor>→</Text>
                    <Text color="green">{row.update.latestVersion ?? 'latest'}</Text>
                  </Box>
                );
              })
            )}
          </Box>
          {updates.length > resultRows && (
            <Text dimColor>{scrollOffset + 1}-{Math.min(scrollOffset + resultRows, updates.length)} of {updates.length}</Text>
          )}
        </Box>
      )}

      <Box flexGrow={1} />
      <StatusBar />
    </Box>
  );
}
