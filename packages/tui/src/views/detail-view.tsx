import { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { useAppContext } from '../context/app-context.js';
import { useTerminalSize } from '../hooks/use-terminal-size.js';
import { ConfirmDialog } from '../components/confirm-dialog.js';
import { StatusBar } from '../components/status-bar.js';

const META_LINES = 8;
const CHROME_LINES = 5;

export function DetailView() {
  const { selectedSkill, setView, refresh, manager } = useAppContext();
  const { rows } = useTerminalSize();
  const [confirming, setConfirming] = useState(false);
  const [forking, setForking] = useState(false);
  const [descScroll, setDescScroll] = useState(0);

  const descLines = useMemo(() => {
    if (!selectedSkill?.description) return [];
    return selectedSkill.description.split('\n');
  }, [selectedSkill]);

  const visibleDescRows = Math.max(1, rows - META_LINES - CHROME_LINES);

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
    if ((input === 'f' || input === 'F') && selectedSkill?.readonly && !forking) {
      setForking(true);
      const writableProvider = manager.getProviders().find((p) => p.capabilities.canCreate);
      if (!writableProvider) { setForking(false); return; }
      manager.forkToLocal(selectedSkill, writableProvider.id)
        .then(() => refresh())
        .then(() => { setForking(false); setView('list'); })
        .catch(() => setForking(false));
    }
    if (key.downArrow) {
      setDescScroll((s) => Math.min(s + 1, Math.max(0, descLines.length - visibleDescRows)));
    }
    if (key.upArrow) {
      setDescScroll((s) => Math.max(0, s - 1));
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

  const visibleDesc = descLines.slice(descScroll, descScroll + visibleDescRows);
  const descScrollable = descLines.length > visibleDescRows;

  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      <Box>
        <Text dimColor>{'< Esc '}</Text>
        <Text bold color="cyan">{selectedSkill.name}</Text>
      </Box>

      <Box marginY={1} flexDirection="column">
        <Box><Text dimColor>{'Platform:  '}</Text><Text>{selectedSkill.provider}</Text></Box>
        <Box><Text dimColor>{'Path:      '}</Text><Text>{selectedSkill.path}</Text></Box>
        {selectedSkill.version && (
          <Box><Text dimColor>{'Version:   '}</Text><Text>{selectedSkill.version}</Text></Box>
        )}
        {selectedSkill.source && (
          <Box><Text dimColor>{'Source:    '}</Text><Text>{selectedSkill.source.type}{selectedSkill.source.repo ? ` (${selectedSkill.source.repo})` : ''}</Text></Box>
        )}
        <Box>
          <Text dimColor>{'Status:    '}</Text>
          <Text color={selectedSkill.enabled ? 'green' : 'red'}>{selectedSkill.enabled ? 'enabled' : 'disabled'}</Text>
        </Box>
        <Box>
          <Text dimColor>{'Editable:  '}</Text>
          <Text color={selectedSkill.readonly ? 'yellow' : 'green'}>{selectedSkill.readonly ? 'read-only (f to fork)' : 'yes'}</Text>
        </Box>
      </Box>

      {conflict && (
        <Box flexDirection="column">
          <Text bold color="yellow">Conflicts</Text>
          {conflict.instances.map((inst) => (
            <Text key={`${inst.provider}:${inst.path}`} color="yellow">
              {'  '}{inst.provider}: {inst.path}
            </Text>
          ))}
        </Box>
      )}

      {descLines.length > 0 && (
        <Box flexDirection="column" flexGrow={1} marginTop={1} borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false}>
          {descScrollable && (
            <Text dimColor>Description {descScroll > 0 ? '▲' : ' '} [{descScroll + 1}-{Math.min(descScroll + visibleDescRows, descLines.length)}/{descLines.length}] {descScroll + visibleDescRows < descLines.length ? '▼' : ' '}</Text>
          )}
          {visibleDesc.map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </Box>
      )}

      <StatusBar />
    </Box>
  );
}
