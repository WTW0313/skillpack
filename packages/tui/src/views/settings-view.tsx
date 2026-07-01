import { Box, Text, useApp, useInput } from 'ink';
import { useMemo, useState, type ReactNode } from 'react';
import { useAppContext } from '../context/app-context.js';
import { StatusBar } from '../components/status-bar.js';
import { formatDisplayPath } from '../lib/format-path.js';
import { useTerminalSize } from '../hooks/use-terminal-size.js';

const PROVIDER_WIDTH = 12;
const KIND_WIDTH = 13;
const STATUS_WIDTH = 8;
const PATH_WIDTH = 64;
const CHROME_LINES = 3;

interface SettingsRow {
  key: string;
  element: ReactNode;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value.padEnd(max);
  return value.slice(0, max - 1) + '…';
}

function formatEnabled(enabled: boolean): string {
  return enabled ? 'enabled' : 'disabled';
}

export function SettingsView() {
  const { exit } = useApp();
  const { config, scanPaths, setView } = useAppContext();
  const { rows } = useTerminalSize();
  const [scrollOffset, setScrollOffset] = useState(0);

  useInput((input, key) => {
    if (input === 'q') { exit(); return; }
    if (key.escape) { setView('list'); }
    if (key.downArrow) {
      setScrollOffset((offset) => Math.min(offset + 1, Math.max(0, contentRows.length - visibleRows)));
    }
    if (key.upArrow) {
      setScrollOffset((offset) => Math.max(0, offset - 1));
    }
  });

  const providerRows = useMemo(() => Object.entries(config.providers).map(([id, provider]) => ({
    id,
    enabled: provider.enabled,
    rootCount: provider.paths.length,
  })), [config.providers]);

  const sourceRows = useMemo(() => Object.entries(config.sources).map(([id, source]) => ({
    id,
    enabled: source.enabled,
  })), [config.sources]);

  const contentRows: SettingsRow[] = useMemo(() => {
    const result: SettingsRow[] = [
      { key: 'scan-heading', element: <Text bold>Scan Roots</Text> },
      {
        key: 'scan-header',
        element: (
          <Box gap={1}>
            <Text dimColor>{truncate('SCOPE', PROVIDER_WIDTH)}</Text>
            <Text dimColor>{truncate('KIND', KIND_WIDTH)}</Text>
            <Text dimColor>{truncate('STATUS', STATUS_WIDTH)}</Text>
            <Text dimColor>{truncate('PATH', PATH_WIDTH)}</Text>
          </Box>
        ),
      },
    ];

    if (scanPaths.length === 0) {
      result.push({ key: 'scan-empty', element: <Text dimColor>  No Scan Roots reported yet.</Text> });
    } else {
      for (const scanPath of scanPaths) {
        const scope = scanPath.provider ?? scanPath.scope;
        result.push({
          key: `scan:${scanPath.scope}:${scanPath.provider ?? 'project'}:${scanPath.path}`,
          element: (
            <Box gap={1}>
              <Text>{truncate(scope, PROVIDER_WIDTH)}</Text>
              <Text dimColor>{truncate(scanPath.kind, KIND_WIDTH)}</Text>
              <Text color={scanPath.exists ? 'green' : 'yellow'}>
                {truncate(scanPath.exists ? 'exists' : 'missing', STATUS_WIDTH)}
              </Text>
              <Text dimColor>{truncate(formatDisplayPath(scanPath.path), PATH_WIDTH)}</Text>
            </Box>
          ),
        });
      }
    }

    result.push({ key: 'provider-gap', element: <Text> </Text> });
    result.push({ key: 'provider-heading', element: <Text bold>Providers</Text> });
    for (const provider of providerRows) {
      result.push({
        key: `provider:${provider.id}`,
        element: (
          <Box gap={1}>
            <Text>{truncate(provider.id, PROVIDER_WIDTH)}</Text>
            <Text color={provider.enabled ? 'green' : 'yellow'}>{formatEnabled(provider.enabled)}</Text>
            <Text dimColor>{provider.rootCount} root{provider.rootCount === 1 ? '' : 's'}</Text>
          </Box>
        ),
      });
    }

    result.push({ key: 'source-gap', element: <Text> </Text> });
    result.push({ key: 'source-heading', element: <Text bold>Sources</Text> });
    for (const source of sourceRows) {
      result.push({
        key: `source:${source.id}`,
        element: (
          <Box gap={1}>
            <Text>{truncate(source.id, PROVIDER_WIDTH)}</Text>
            <Text color={source.enabled ? 'green' : 'yellow'}>{formatEnabled(source.enabled)}</Text>
          </Box>
        ),
      });
    }

    return result;
  }, [providerRows, scanPaths, sourceRows]);

  const visibleRows = Math.max(1, rows - CHROME_LINES);
  const visibleContent = contentRows.slice(scrollOffset, scrollOffset + visibleRows);
  const showScroll = contentRows.length > visibleRows;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box paddingX={1}>
        <Text dimColor>‹ esc  </Text>
        <Text bold color="magenta">Settings</Text>
        <Text dimColor>  read-only</Text>
        {showScroll && (
          <Text dimColor>  {scrollOffset + 1}–{Math.min(scrollOffset + visibleRows, contentRows.length)} of {contentRows.length}</Text>
        )}
      </Box>

      <Box flexDirection="column" paddingX={1} marginTop={1} height={visibleRows}>
        {visibleContent.map((row) => (
          <Box key={row.key}>{row.element}</Box>
        ))}
      </Box>

      <Box flexGrow={1} />
      <StatusBar />
    </Box>
  );
}
