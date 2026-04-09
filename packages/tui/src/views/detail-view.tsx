import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { useAppContext } from '../context/app-context.js';
import { ConfirmDialog } from '../components/confirm-dialog.js';
import { StatusBar } from '../components/status-bar.js';

export function DetailView() {
  const { selectedSkill, setView, refresh, manager } = useAppContext();
  const [confirming, setConfirming] = useState(false);

  useInput((input, key) => {
    if (key.escape) { setView('list'); return; }
    if ((input === 'e' || input === 'E') && selectedSkill && !selectedSkill.readonly) {
      const editor = process.env.EDITOR || 'vi';
      const skillMd = path.join(selectedSkill.path, 'SKILL.md');
      try {
        execSync(`${editor} "${skillMd}"`, { stdio: 'inherit' });
      } catch { /* editor exited non-zero */ }
      refresh();
      return;
    }
    if (input === 'd' && selectedSkill && !selectedSkill.readonly) {
      setConfirming(true);
    }
  }, { isActive: !confirming });

  if (!selectedSkill) {
    return <Box><Text color="red">No skill selected</Text></Box>;
  }

  const conflict = manager.getConflicts().find((c) => c.skillName === selectedSkill.name);

  if (confirming) {
    return (
      <Box flexDirection="column" padding={1}>
        <ConfirmDialog
          message={`Delete skill "${selectedSkill.name}"?`}
          onConfirm={async () => {
            await manager.uninstallSkill(selectedSkill);
            await refresh();
            setView('list');
          }}
          onCancel={() => setConfirming(false)}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">{selectedSkill.name}</Text>

      <Box marginY={1} flexDirection="column">
        <Box>
          <Text dimColor>{'Provider:  '}</Text>
          <Text>{selectedSkill.provider}</Text>
        </Box>
        <Box>
          <Text dimColor>{'Path:      '}</Text>
          <Text>{selectedSkill.path}</Text>
        </Box>
        {selectedSkill.version && (
          <Box>
            <Text dimColor>{'Version:   '}</Text>
            <Text>{selectedSkill.version}</Text>
          </Box>
        )}
        {selectedSkill.source && (
          <Box>
            <Text dimColor>{'Source:    '}</Text>
            <Text>{selectedSkill.source.type}</Text>
          </Box>
        )}
        <Box>
          <Text dimColor>{'Status:    '}</Text>
          <Text color={selectedSkill.enabled ? 'green' : 'red'}>
            {selectedSkill.enabled ? 'enabled' : 'disabled'}
          </Text>
        </Box>
        <Box>
          <Text dimColor>{'Editable:  '}</Text>
          <Text>{selectedSkill.readonly ? 'no' : 'yes'}</Text>
        </Box>
      </Box>

      {selectedSkill.description && (
        <Box marginY={1} flexDirection="column">
          <Text bold>Description</Text>
          <Text>{selectedSkill.description}</Text>
        </Box>
      )}

      {conflict && (
        <Box marginY={1} flexDirection="column">
          <Text bold color="yellow">Conflicts</Text>
          {conflict.instances.map((inst) => (
            <Text key={`${inst.provider}:${inst.path}`} color="yellow">
              {'  '}{inst.provider}: {inst.path}
            </Text>
          ))}
        </Box>
      )}

      <StatusBar />
    </Box>
  );
}
