import { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { Spinner } from '@inkjs/ui';
import { useAppContext } from '../context/app-context.js';
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
        <Spinner label="Checking for updates..." />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      <Text bold color="cyan">Available Updates</Text>

      {updates.length === 0 ? (
        <Box marginY={1}>
          <Text dimColor>All skills are up to date.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginY={1}>
          {updates.map(({ skill, update }, i) => (
            <Box key={`${skill.provider}:${skill.name}`} gap={1}>
              <Text color={i === cursor ? 'cyan' : undefined}>
                {i === cursor ? '>' : ' '}
              </Text>
              <Text color={i === cursor ? 'cyan' : 'white'} bold={i === cursor}>
                {skill.name.padEnd(30)}
              </Text>
              <Text dimColor>
                {update.currentVersion ?? '?'} {'→'} {update.latestVersion ?? '?'}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Esc: back  up/down: navigate</Text>
      </Box>
    </Box>
  );
}
