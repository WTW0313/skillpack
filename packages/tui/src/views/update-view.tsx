import { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { Spinner } from '@inkjs/ui';
import { useAppContext } from '../context/app-context.js';
import { StatusBar } from '../components/status-bar.js';
import type { Skill, UpdateInfo } from '@skillpack/core';

export function UpdateView() {
  const { setView, manager } = useAppContext();
  const [checking, setChecking] = useState(true);
  const [updates, setUpdates] = useState<Array<{ skill: Skill; update: UpdateInfo }>>([]);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    manager.checkUpdates().then((result) => {
      setUpdates(result);
      setChecking(false);
    });
  }, [manager]);

  useInput((_input, key) => {
    if (key.escape) { setView('list'); return; }
    if (key.downArrow) setCursor((c) => Math.min(c + 1, updates.length - 1));
    if (key.upArrow) setCursor((c) => Math.max(c - 1, 0));
  });

  if (checking) {
    return (
      <Box padding={1}>
        <Spinner label="Checking for updates…" />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      {/* Header */}
      <Box>
        <Text dimColor>‹ esc  </Text>
        <Text bold color="magenta">Updates</Text>
        {!checking && (
          <Text dimColor>  {updates.length} available</Text>
        )}
      </Box>

      {updates.length === 0 ? (
        <Box marginTop={2}>
          <Text dimColor>All skills are up to date. ✓</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {/* Column header */}
          <Box gap={1} marginBottom={1}>
            <Text>{' '}</Text>
            <Text dimColor>{'NAME'.padEnd(30)}</Text>
            <Text dimColor>VERSION</Text>
          </Box>

          {updates.map(({ skill, update }, i) => (
            <Box key={`${skill.provider}:${skill.name}`} gap={1}>
              <Text color={i === cursor ? 'magenta' : undefined}>
                {i === cursor ? '❯' : ' '}
              </Text>
              <Text
                bold={i === cursor}
                color={i === cursor ? 'white' : undefined}
                dimColor={i !== cursor}
              >
                {skill.name.padEnd(30)}
              </Text>
              <Text dimColor={i !== cursor}>
                <Text dimColor>{update.currentVersion ?? '?'}</Text>
                <Text color="magenta"> → </Text>
                <Text bold={i === cursor}>{update.latestVersion ?? '?'}</Text>
              </Text>
            </Box>
          ))}
        </Box>
      )}

      <Box flexGrow={1} />
      <StatusBar />
    </Box>
  );
}
