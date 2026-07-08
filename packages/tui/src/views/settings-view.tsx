import { Box, Text, useApp, useInput } from 'ink';
import { useMemo, useState, type ReactNode } from 'react';
import { useAppContext } from '../context/app-context.js';
import { StatusBar } from '../components/status-bar.js';
import { formatDisplayPath } from '../lib/format-path.js';
import { useTerminalSize } from '../hooks/use-terminal-size.js';
import { fitCell, getBoundedContentLayout, getSettingsColumns } from '../lib/responsive-layout.js';

interface SettingsRow {
  key: string;
  element: ReactNode;
}

function formatEnabled(enabled: boolean): string {
  return enabled ? 'enabled' : 'disabled';
}

export function SettingsView() {
  const { exit } = useApp();
  const { config, scanPaths, setView } = useAppContext();
  const { columns, rows } = useTerminalSize();
  const [scrollOffset, setScrollOffset] = useState(0);
  const layout = getBoundedContentLayout({
    size: { columns, rows },
    fullChromeLines: 3,
    compactChromeLines: 3,
  });
  const tableColumns = getSettingsColumns({ columns, rows });

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

  const usageRootRows = useMemo(() => Object.entries(config.usage.artifactRoots).flatMap(([provider, roots]) => (
    roots.map((root) => ({ provider, root }))
  )), [config.usage.artifactRoots]);

  const contentRows: SettingsRow[] = useMemo(() => {
    const result: SettingsRow[] = [
      { key: 'scan-heading', element: <Text bold>Scan Roots</Text> },
      {
        key: 'scan-header',
        element: (
          <Box gap={1}>
            <Text dimColor>{fitCell('SCOPE', tableColumns.scope)}</Text>
            <Text dimColor>{fitCell('KIND', tableColumns.kind)}</Text>
            <Text dimColor>{fitCell('STATUS', tableColumns.status)}</Text>
            <Text dimColor>{fitCell('PATH', tableColumns.path)}</Text>
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
              <Text>{fitCell(scope, tableColumns.scope)}</Text>
              <Text dimColor>{fitCell(scanPath.kind, tableColumns.kind)}</Text>
              <Text color={scanPath.exists ? 'green' : 'yellow'}>
                {fitCell(scanPath.exists ? 'exists' : 'missing', tableColumns.status)}
              </Text>
              <Text dimColor>{fitCell(formatDisplayPath(scanPath.path), tableColumns.path)}</Text>
            </Box>
          ),
        });
      }
    }

    result.push({ key: 'usage-roots-gap', element: <Text> </Text> });
    result.push({ key: 'usage-roots-heading', element: <Text bold>Usage Artifact Roots</Text> });
    if (usageRootRows.length === 0) {
      result.push({ key: 'usage-roots-empty', element: <Text dimColor>  No Usage Artifact Roots configured.</Text> });
    } else {
      for (const row of usageRootRows) {
        result.push({
          key: `usage-root:${row.provider}:${row.root}`,
          element: (
            <Box gap={1}>
              <Text>{fitCell(row.provider, tableColumns.scope)}</Text>
              <Text dimColor>{fitCell('usage-root', tableColumns.kind)}</Text>
              <Text color="green">{fitCell('configured', tableColumns.status)}</Text>
              <Text dimColor>{fitCell(formatDisplayPath(row.root), tableColumns.path)}</Text>
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
            <Text>{fitCell(provider.id, tableColumns.scope)}</Text>
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
            <Text>{fitCell(source.id, tableColumns.scope)}</Text>
            <Text color={source.enabled ? 'green' : 'yellow'}>{formatEnabled(source.enabled)}</Text>
          </Box>
        ),
      });
    }

    return result;
  }, [providerRows, scanPaths, sourceRows, tableColumns, usageRootRows]);

  const visibleRows = layout.visibleRows;
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
