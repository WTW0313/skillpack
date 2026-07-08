import { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { ConfirmDialog } from '../components/confirm-dialog.js';
import { StatusBar } from '../components/status-bar.js';
import { useAppContext } from '../context/app-context.js';
import type {
  ProviderSkillUsageOverview,
  SkillUsageHeatmapCell,
  SkillUsageOverview,
  UsageCoverageState,
} from '@skillpack/core';

const USAGE_RANGES = [7, 30, 90] as const;
const HEATMAP_COLUMNS = 7;

export function UsageView() {
  const { exit } = useApp();
  const {
    manager,
    config,
    setUsageImportConsent,
    setView,
    importSkillUsage,
    usageImporting,
    usageImportError,
    usageImportRevision,
  } = useAppContext();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [overview, setOverview] = useState<SkillUsageOverview | null>(null);
  const [rangeIndex, setRangeIndex] = useState(0);
  const [selectedProviderIndex, setSelectedProviderIndex] = useState(0);
  const [selectedHeatmapIndex, setSelectedHeatmapIndex] = useState(0);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const rangeDays = USAGE_RANGES[rangeIndex];
  const hasConsent = config.usage?.importConsent === true;
  const selectedProvider = overview?.providers[selectedProviderIndex];
  const selectedHeatmapCell = selectedProvider?.heatmap[selectedHeatmapIndex];

  useEffect(() => {
    if (!hasConsent) {
      setOverview(null);
      return;
    }

    let cancelled = false;
    manager.getSkillUsageOverview({ rangeDays })
      .then((nextOverview) => {
        if (!cancelled) setOverview(nextOverview);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });

    return () => { cancelled = true; };
  }, [hasConsent, manager, rangeDays, refreshNonce, usageImportRevision]);

  useEffect(() => {
    if (!overview) return;
    if (selectedProviderIndex >= overview.providers.length) setSelectedProviderIndex(0);
  }, [overview, selectedProviderIndex]);

  useEffect(() => {
    if (!selectedProvider) {
      setSelectedHeatmapIndex(0);
      return;
    }
    if (selectedHeatmapIndex >= selectedProvider.heatmap.length) setSelectedHeatmapIndex(0);
  }, [selectedProvider, selectedHeatmapIndex]);

  useInput((input, key) => {
    if (input === 'q') { exit(); return; }
    if (key.escape) { setView('list'); }
    if (key.tab && hasConsent) {
      setRangeIndex((index) => (index + 1) % USAGE_RANGES.length);
      setSelectedHeatmapIndex(0);
    }
    if (key.upArrow && hasConsent && overview && overview.providers.length > 1) {
      setSelectedProviderIndex((index) => (index + overview.providers.length - 1) % overview.providers.length);
      setSelectedHeatmapIndex(0);
    }
    if (key.downArrow && hasConsent && overview && overview.providers.length > 1) {
      setSelectedProviderIndex((index) => (index + 1) % overview.providers.length);
      setSelectedHeatmapIndex(0);
    }
    if (key.leftArrow && hasConsent && selectedProvider && selectedProvider.heatmap.length > 0) {
      setSelectedHeatmapIndex((index) => (index + selectedProvider.heatmap.length - 1) % selectedProvider.heatmap.length);
    }
    if (key.rightArrow && hasConsent && selectedProvider && selectedProvider.heatmap.length > 0) {
      setSelectedHeatmapIndex((index) => (index + 1) % selectedProvider.heatmap.length);
    }
    if (input === 'r' && hasConsent) {
      setOverview(null);
      importSkillUsage().catch((err) => { setError(err instanceof Error ? err.message : String(err)); });
    }
    if (input === 'x' && hasConsent) {
      setConfirmingReset(true);
    }
    if (input.toLowerCase() === 'y' && !hasConsent && !saving) {
      setSaving(true);
      setError(null);
      setUsageImportConsent(true)
        .catch((err) => { setError(err instanceof Error ? err.message : String(err)); })
        .finally(() => { setSaving(false); });
    }
  });

  if (confirmingReset) {
    return (
      <ConfirmDialog
        message="Reset Skill Usage data?"
        onConfirm={() => {
          manager.resetSkillUsage()
            .then(() => {
              setConfirmingReset(false);
              setOverview(null);
              setRefreshNonce((value) => value + 1);
            })
            .catch((err) => {
              setError(err instanceof Error ? err.message : String(err));
              setConfirmingReset(false);
            });
        }}
        onCancel={() => { setConfirmingReset(false); }}
      />
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box paddingX={1}>
        <Text bold color="magenta">Skill Usage</Text>
        <Text dimColor>  {rangeDays} days</Text>
      </Box>

      <Box flexDirection="column" paddingX={1} marginTop={1}>
        {hasConsent ? (
          <>
            <Text dimColor>Usage coverage</Text>
            {overview
              ? overview.providers.map((provider) => (
                <ProviderCoverageRow
                  key={provider.provider}
                  provider={provider}
                  selected={overview.providers[selectedProviderIndex]?.provider === provider.provider}
                />
              ))
              : <Text dimColor>Loading usage...</Text>}
            {usageImporting && <Text dimColor>Importing usage...</Text>}
            {selectedProvider && selectedProvider.heatmap.length > 0 && (
              <>
                <Box marginTop={1}><Text dimColor>Heatmap</Text></Box>
                {chunkHeatmap(selectedProvider.heatmap).map((row, rowIndex) => (
                  <Box key={`heatmap-row:${rowIndex}`} flexDirection="row">
                    {row.map((cell, columnIndex) => {
                      const index = rowIndex * HEATMAP_COLUMNS + columnIndex;
                      return (
                        <Text key={cell.date} color={heatmapColor(cell)}>
                          {formatHeatmapCell(cell, index === selectedHeatmapIndex)}
                        </Text>
                      );
                    })}
                  </Box>
                ))}
                {selectedHeatmapCell && (
                  <Text>
                    {selectedHeatmapCell.date}{' '}
                    {selectedProvider.displayName}{' '}
                    counted {selectedHeatmapCell.countedInvocations}
                    {selectedHeatmapCell.failedInvocations > 0 ? ` failed ${selectedHeatmapCell.failedInvocations}` : ''}
                  </Text>
                )}
              </>
            )}
            {selectedProvider && selectedProvider.ranking.length > 0 && (
              <>
                <Box marginTop={1}><Text dimColor>Ranking</Text></Box>
                {selectedProvider.ranking.map((row) => (
                  <Text key={row.skillName}>
                    {row.skillName}{' -> '}{row.countedInvocations}
                    {row.failedInvocations > 0 ? ` failed ${row.failedInvocations}` : ''}
                    {row.historical ? ' historical' : ''}
                  </Text>
                ))}
              </>
            )}
            {selectedProvider && selectedProvider.diagnostics.length > 0 && (
              <>
                <Box marginTop={1}><Text dimColor>Import diagnostics</Text></Box>
                {selectedProvider.diagnostics.map((diagnostic) => (
                  <Text key={diagnostic.message}>{diagnostic.message}</Text>
                ))}
              </>
            )}
            {usageImportError && <Text color="red">{usageImportError}</Text>}
            {error && <Text color="red">{error}</Text>}
          </>
        ) : (
          <>
            <Text bold>Enable usage import?</Text>
            <Text dimColor>Skillpack can derive aggregate Skill Usage from provider session artifacts.</Text>
            <Text dimColor>No prompts, responses, tool arguments, file contents, or transcripts are stored.</Text>
            <Text dimColor>Press y to enable.</Text>
            {saving && <Text dimColor>Saving consent...</Text>}
            {error && <Text color="red">{error}</Text>}
          </>
        )}
      </Box>

      <Box flexGrow={1} />
      <StatusBar />
    </Box>
  );
}

function ProviderCoverageRow({ provider, selected }: { provider: ProviderSkillUsageOverview; selected: boolean }) {
  const badge = coverageBadge(provider.coverageState);
  return (
    <Text>
      {selected ? '> ' : '  '}
      {provider.displayName}{' '}
      <Text color={badge.color}>{badge.label}</Text>
    </Text>
  );
}

function coverageBadge(state: UsageCoverageState): { label: string; color: string } {
  switch (state) {
    case 'active': return { label: '[active]', color: 'green' };
    case 'zero': return { label: '[zero]', color: 'yellow' };
    case 'not-configured': return { label: '[not configured]', color: 'yellow' };
    case 'unsupported': return { label: '[unsupported]', color: 'red' };
  }
}

function chunkHeatmap(cells: SkillUsageHeatmapCell[]): SkillUsageHeatmapCell[][] {
  const rows: SkillUsageHeatmapCell[][] = [];
  for (let index = 0; index < cells.length; index += HEATMAP_COLUMNS) {
    rows.push(cells.slice(index, index + HEATMAP_COLUMNS));
  }
  return rows;
}

function formatHeatmapCell(cell: SkillUsageHeatmapCell, selected: boolean): string {
  const label = cell.failedInvocations > 0
    ? `!${cappedCount(cell.failedInvocations)}`
    : cappedCount(cell.countedInvocations);
  const padded = label.padStart(3).slice(-3);
  return selected ? `[${padded}] ` : ` ${padded}  `;
}

function cappedCount(value: number): string {
  return value > 99 ? '99+' : String(value);
}

function heatmapColor(cell: SkillUsageHeatmapCell): string {
  if (cell.failedInvocations > 0) return 'red';
  if (cell.countedInvocations >= 10) return 'magenta';
  if (cell.countedInvocations > 0) return 'cyan';
  return 'gray';
}
