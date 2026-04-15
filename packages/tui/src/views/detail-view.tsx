import { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { useAppContext } from '../context/app-context.js';
import { useTerminalSize } from '../hooks/use-terminal-size.js';
import { ConfirmDialog } from '../components/confirm-dialog.js';
import { StatusBar } from '../components/status-bar.js';

const META_LINES = 10;
const CHROME_LINES = 4;

export function DetailView() {
  const { selectedSkill, setView, refresh, manager } = useAppContext();
  const { rows } = useTerminalSize();
  const [confirming, setConfirming] = useState(false);
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
    if (input === ' ' && selectedSkill) {
      manager.toggleSkill(selectedSkill).then(() => refresh());
      return;
    }
    if (input === 'd' && selectedSkill && !selectedSkill.readonly) {
      setConfirming(true);
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
          message={`Delete "${selectedSkill.name}"?`}
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
      {/* Navigation + title */}
      <Box>
        <Text dimColor>‹ esc  </Text>
        <Text bold color="magenta">◆</Text>
        <Text bold> {selectedSkill.name}</Text>
      </Box>

      {/* Metadata */}
      <Box marginTop={1} flexDirection="column" gap={0}>
        <Box gap={1}>
          <Text dimColor>{'agent'.padEnd(10)}</Text>
          <Text>{selectedSkill.provider}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>{'path'.padEnd(10)}</Text>
          <Text dimColor>{selectedSkill.path}</Text>
        </Box>
        {selectedSkill.version && (
          <Box gap={1}>
            <Text dimColor>{'version'.padEnd(10)}</Text>
            <Text>{selectedSkill.version}</Text>
          </Box>
        )}
        {selectedSkill.source && (
          <Box gap={1}>
            <Text dimColor>{'source'.padEnd(10)}</Text>
            <Text>{selectedSkill.source.type}{selectedSkill.source.repo ? ` ${selectedSkill.source.repo}` : ''}</Text>
          </Box>
        )}
        <Box gap={1}>
          <Text dimColor>{'status'.padEnd(10)}</Text>
          <Text color={selectedSkill.enabled ? 'green' : undefined} dimColor={!selectedSkill.enabled}>
            {selectedSkill.enabled ? '● enabled' : '○ disabled'}
          </Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>{'editable'.padEnd(10)}</Text>
          <Text color={selectedSkill.readonly ? 'yellow' : 'green'}>
            {selectedSkill.readonly ? 'read-only' : 'yes'}
          </Text>
        </Box>
      </Box>

      {/* Conflicts */}
      {conflict && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="yellow">⚠ Conflicts</Text>
          {conflict.instances.map((inst) => (
            <Text key={`${inst.provider}:${inst.path}`} dimColor>
              {'  '}{inst.provider} → {inst.path}
            </Text>
          ))}
        </Box>
      )}

      {/* Description */}
      {descLines.length > 0 && (
        <Box flexDirection="column" flexGrow={1} marginTop={1}>
          <Box>
            <Text dimColor>{'─'.repeat(40)}</Text>
          </Box>
          {descScrollable && (
            <Box gap={1}>
              <Text dimColor>description</Text>
              {descScroll > 0 && <Text>▲</Text>}
              <Text dimColor>{descScroll + 1}–{Math.min(descScroll + visibleDescRows, descLines.length)} of {descLines.length}</Text>
              {descScroll + visibleDescRows < descLines.length && <Text>▼</Text>}
            </Box>
          )}
          {!descScrollable && <Text dimColor>description</Text>}
          <Box flexDirection="column" marginTop={0}>
            {visibleDesc.map((line, i) => (
              <Text key={i}>{line}</Text>
            ))}
          </Box>
        </Box>
      )}

      <Box flexGrow={1} />
      <StatusBar />
    </Box>
  );
}
