import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { ConfirmDialog } from '../components/confirm-dialog.js';
import { StatusBar } from '../components/status-bar.js';
import { useAppContext } from '../context/app-context.js';
import { useTerminalSize } from '../hooks/use-terminal-size.js';
import { fitCell, getBoundedContentLayout } from '../lib/responsive-layout.js';
import type {
  ProviderSkillUsageOverview,
  ProviderSkillUsageRow,
  SkillUsageHeatmapCell,
  SkillUsageOverview,
  UsageCoverageState,
} from '@skillpack/core';

const USAGE_RANGES = [7, 30, 90] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const HEATMAP_CELL_WIDTH = 3;

interface UsageContentRow {
  key: string;
  element: ReactNode;
}

interface CalendarWeek {
  monthLabel?: string;
  days: Array<SkillUsageHeatmapCell | null>;
}

export function UsageView() {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const rangeDays = USAGE_RANGES[rangeIndex];
  const hasConsent = config.usage?.importConsent === true;
  const selectedProvider = overview?.providers[selectedProviderIndex];
  const effectiveSelectedDate = selectedDate ?? overview?.range.to ?? null;
  const selectedHeatmapCell = selectedProvider?.heatmap.find((cell) => cell.date === effectiveSelectedDate);
  const selectedDayUsage = selectedProvider?.dailySkillUsage.find((day) => day.date === effectiveSelectedDate);
  const layout = getBoundedContentLayout({
    size: { columns, rows },
    fullChromeLines: 3,
    compactChromeLines: 3,
  });

  useEffect(() => {
    if (!hasConsent) {
      setOverview(null);
      return;
    }

    let cancelled = false;
    manager
      .getSkillUsageOverview({ rangeDays })
      .then((nextOverview) => {
        if (!cancelled) setOverview(nextOverview);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [hasConsent, manager, rangeDays, refreshNonce, usageImportRevision]);

  useEffect(() => {
    if (!overview) return;
    if (selectedProviderIndex >= overview.providers.length) setSelectedProviderIndex(0);
  }, [overview, selectedProviderIndex]);

  useEffect(() => {
    setSelectedDate(null);
    setScrollOffset(0);
  }, [selectedProviderIndex, rangeIndex]);

  const contentRows = useMemo(() => {
    if (!hasConsent) return [];
    if (!overview) return [{ key: 'loading', element: <Text dimColor>Loading usage...</Text> }];
    return buildUsageContentRows({
      overview,
      rangeDays,
      selectedProviderIndex,
      selectedProvider,
      selectedDate: effectiveSelectedDate,
      selectedHeatmapCell,
      selectedDayRows: selectedDayUsage?.rows ?? [],
      usageImporting,
      usageImportError,
      error,
      columns,
    });
  }, [
    columns,
    error,
    hasConsent,
    overview,
    rangeDays,
    effectiveSelectedDate,
    selectedDayUsage,
    selectedHeatmapCell,
    selectedProvider,
    selectedProviderIndex,
    usageImportError,
    usageImporting,
  ]);

  const visibleRows = layout.visibleRows;
  const maxScrollOffset = Math.max(0, contentRows.length - visibleRows);
  const boundedScrollOffset = Math.min(scrollOffset, maxScrollOffset);
  const visibleContent = contentRows.slice(boundedScrollOffset, boundedScrollOffset + visibleRows);
  const showScroll = hasConsent && contentRows.length > visibleRows;

  useEffect(() => {
    if (scrollOffset > maxScrollOffset) setScrollOffset(maxScrollOffset);
  }, [maxScrollOffset, scrollOffset]);

  useInput((input, key) => {
    if (confirmingReset) return;
    if (input === 'q') {
      exit();
      return;
    }
    if (key.escape) {
      setView('list');
      return;
    }
    if (key.tab && key.shift && hasConsent && overview && overview.providers.length > 1) {
      setSelectedProviderIndex((index) => (index + overview.providers.length - 1) % overview.providers.length);
      return;
    }
    if (key.tab && hasConsent && overview && overview.providers.length > 1) {
      setSelectedProviderIndex((index) => (index + 1) % overview.providers.length);
      return;
    }
    if (input === '1' && hasConsent) {
      setRangeIndex(0);
      return;
    }
    if (input === '2' && hasConsent) {
      setRangeIndex(1);
      return;
    }
    if (input === '3' && hasConsent) {
      setRangeIndex(2);
      return;
    }
    if (key.leftArrow && hasConsent) {
      setScrollOffset(0);
      setSelectedDate((date) => moveDateWithinRange(date, overview, -WEEK_MS, selectedProvider?.heatmap, true));
      return;
    }
    if (key.rightArrow && hasConsent) {
      setScrollOffset(0);
      setSelectedDate((date) => moveDateWithinRange(date, overview, WEEK_MS, selectedProvider?.heatmap, true));
      return;
    }
    if (key.upArrow && hasConsent) {
      setScrollOffset(0);
      setSelectedDate((date) => moveDateWithinRange(date, overview, -DAY_MS, selectedProvider?.heatmap));
      return;
    }
    if (key.downArrow && hasConsent) {
      setScrollOffset(0);
      setSelectedDate((date) => moveDateWithinRange(date, overview, DAY_MS, selectedProvider?.heatmap));
      return;
    }
    if (key.pageDown && hasConsent) {
      setScrollOffset((offset) => Math.min(offset + visibleRows, maxScrollOffset));
      return;
    }
    if (key.pageUp && hasConsent) {
      setScrollOffset((offset) => Math.max(0, offset - visibleRows));
      return;
    }
    if (key.home && hasConsent) {
      setScrollOffset(0);
      return;
    }
    if (key.end && hasConsent) {
      setScrollOffset(maxScrollOffset);
      return;
    }
    if (input === 'r' && hasConsent) {
      setOverview(null);
      importSkillUsage().catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
    }
    if (input === 'x' && hasConsent) {
      setConfirmingReset(true);
    }
    if (input.toLowerCase() === 'y' && !hasConsent && !saving) {
      setSaving(true);
      setError(null);
      setUsageImportConsent(true)
        .catch((err) => {
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          setSaving(false);
        });
    }
  });

  if (confirmingReset) {
    return (
      <ConfirmDialog
        message="Reset Skill Usage data?"
        onConfirm={() => {
          manager
            .resetSkillUsage()
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
        onCancel={() => {
          setConfirmingReset(false);
        }}
      />
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box paddingX={1}>
        <Text bold color="magenta">
          Skill Usage
        </Text>
        <Text dimColor>
          {'  '}
          {rangeDays} days
        </Text>
        {showScroll && (
          <Text dimColor>
            {'  '}
            {boundedScrollOffset + 1}-{Math.min(boundedScrollOffset + visibleRows, contentRows.length)} of{' '}
            {contentRows.length}
          </Text>
        )}
      </Box>

      <Box flexDirection="column" paddingX={1} marginTop={1} height={hasConsent ? visibleRows : undefined}>
        {hasConsent ? (
          <>
            {visibleContent.map((row) => (
              <Box key={row.key}>{row.element}</Box>
            ))}
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

function coverageBadge(state: UsageCoverageState): { label: string; color: string } {
  switch (state) {
    case 'active':
      return { label: '[active]', color: 'green' };
    case 'zero':
      return { label: '[zero]', color: 'yellow' };
    case 'not-configured':
      return { label: '[not configured]', color: 'yellow' };
    case 'unsupported':
      return { label: '[unsupported]', color: 'red' };
  }
}

function buildUsageContentRows(input: {
  overview: SkillUsageOverview;
  rangeDays: number;
  selectedProviderIndex: number;
  selectedProvider: ProviderSkillUsageOverview | undefined;
  selectedDate: string | null;
  selectedHeatmapCell: SkillUsageHeatmapCell | undefined;
  selectedDayRows: ProviderSkillUsageRow[];
  usageImporting: boolean;
  usageImportError: string | null;
  error: string | null;
  columns: number;
}): UsageContentRow[] {
  const rows: UsageContentRow[] = [];
  rows.push({
    key: 'providers',
    element: (
      <Text>
        <Text dimColor>Providers{'  '}</Text>
        {input.overview.providers.map((provider, index) =>
          renderProviderTab(provider, index === input.selectedProviderIndex),
        )}
      </Text>
    ),
  });
  rows.push({
    key: 'range',
    element: (
      <Text>
        <Text dimColor>Range{'      '}</Text>
        {USAGE_RANGES.map((range) => (
          <Text key={range}>{range === input.rangeDays ? `[${range}d]  ` : `${range}d  `}</Text>
        ))}
      </Text>
    ),
  });
  if (input.usageImporting) rows.push({ key: 'importing', element: <Text dimColor>Importing usage...</Text> });
  rows.push({ key: 'gap:top', element: <Text> </Text> });

  if (!input.selectedProvider) {
    rows.push({ key: 'empty:no-provider', element: <Text dimColor>No usage provider selected.</Text> });
    return rows;
  }

  const provider = input.selectedProvider;
  if (provider.coverageState === 'unsupported' || provider.coverageState === 'not-configured') {
    rows.push({ key: 'empty:state', element: <Text>{emptyStateForProvider(provider)}</Text> });
    rows.push({ key: 'empty:records', element: <Text dimColor>No usage records for this provider and range.</Text> });
    appendErrors(rows, input);
    return rows;
  }

  const sideBySide = shouldRenderSideBySide(input.columns, provider.heatmap);
  const heatmapRows = [
    { key: 'heatmap:heading', element: <Text dimColor>Usage heatmap</Text> },
    ...renderCalendarHeatmap(provider.heatmap, input.selectedDate),
  ];
  if (sideBySide) {
    const heatmapWidth = heatmapDisplayWidth(provider.heatmap);
    const detailColumns = Math.max(30, input.columns - heatmapWidth - 6);
    const detailRows = renderSelectedDayDetail(
      provider,
      input.selectedHeatmapCell,
      input.selectedDayRows,
      detailColumns,
    );
    rows.push(...combineSideBySideRows(heatmapRows, detailRows, heatmapWidth, detailColumns));
  } else {
    rows.push(...heatmapRows);
    rows.push({ key: 'gap:detail', element: <Text> </Text> });
    rows.push(...renderSelectedDayDetail(provider, input.selectedHeatmapCell, input.selectedDayRows, input.columns));
  }
  rows.push({ key: 'gap:ranking', element: <Text> </Text> });
  rows.push(...renderRankingTable(provider, input.columns));
  if (provider.diagnostics.length > 0) {
    rows.push({ key: 'gap:diagnostics', element: <Text> </Text> });
    rows.push({ key: 'diagnostics:heading', element: <Text dimColor>Import diagnostics</Text> });
    for (const diagnostic of provider.diagnostics) {
      rows.push({ key: `diagnostic:${diagnostic.message}`, element: <Text>{diagnostic.message}</Text> });
    }
  }
  appendErrors(rows, input);
  return rows;
}

function renderProviderTab(provider: ProviderSkillUsageOverview, selected: boolean): ReactNode {
  const suffix =
    provider.coverageState === 'active'
      ? ''
      : ` ${coverageBadge(provider.coverageState).label.replace(/^\[|\]$/g, '')}`;
  const label = `${provider.displayName}${suffix}`;
  return (
    <Text key={provider.provider} color={selected ? 'cyan' : undefined}>
      {selected ? `[${label}]  ` : `${label}  `}
    </Text>
  );
}

function emptyStateForProvider(provider: ProviderSkillUsageOverview): string {
  if (provider.coverageState === 'unsupported') return `Usage import is not supported for ${provider.displayName} yet.`;
  if (provider.coverageState === 'not-configured') {
    const missingArtifactRoots = provider.coverageReasons.includes('missing-artifact-roots');
    const missingAttributionRoots = provider.coverageReasons.includes('missing-attribution-roots');
    if (missingArtifactRoots && missingAttributionRoots) {
      return `${provider.displayName} Usage Artifact Roots and Skill Attribution Roots are not configured.`;
    }
    if (missingAttributionRoots) {
      return `${provider.displayName} Skill Attribution Roots are not configured.`;
    }
    if (missingArtifactRoots) {
      return `${provider.displayName} Usage Artifact Roots are not configured.`;
    }
    return `${provider.displayName} Usage Import is not configured.`;
  }
  return `No usage records for ${provider.displayName}.`;
}

function renderCalendarHeatmap(cells: SkillUsageHeatmapCell[], selectedDate: string | null): UsageContentRow[] {
  const weeks = calendarWeeks(cells);
  const maxCount = Math.max(0, ...cells.map((cell) => cell.countedInvocations));
  const rows: UsageContentRow[] = [];
  rows.push({
    key: 'heatmap:months',
    element: (
      <Text>
        {' '.repeat(10)}
        {weeks.map((week, index) => (
          <Text key={`month:${index}`}>{fitCell(week.monthLabel ?? '', HEATMAP_CELL_WIDTH)}</Text>
        ))}
      </Text>
    ),
  });
  for (let day = 0; day < 7; day += 1) {
    rows.push({
      key: `heatmap:day:${day}`,
      element: (
        <Text>
          {' '.repeat(10)}
          {weeks.map((week, weekIndex) => {
            const cell = week.days[day];
            return (
              <Text
                key={`cell:${weekIndex}:${day}`}
                color={cell ? heatmapColor(cell, maxCount) : undefined}
                dimColor={cell?.countedInvocations === 0}
              >
                {cell ? formatHeatmapCell(cell, cell.date === selectedDate) : ' '.repeat(HEATMAP_CELL_WIDTH)}
              </Text>
            );
          })}
        </Text>
      ),
    });
  }
  return rows;
}

function shouldRenderSideBySide(columns: number, cells: SkillUsageHeatmapCell[]): boolean {
  return cells.length > 0 && columns >= Math.max(96, heatmapDisplayWidth(cells) + 36);
}

function heatmapDisplayWidth(cells: SkillUsageHeatmapCell[]): number {
  return Math.max(20, 10 + calendarWeeks(cells).length * HEATMAP_CELL_WIDTH);
}

function combineSideBySideRows(
  leftRows: UsageContentRow[],
  rightRows: UsageContentRow[],
  leftWidth: number,
  rightWidth: number,
): UsageContentRow[] {
  const combined: UsageContentRow[] = [];
  const rowCount = Math.max(leftRows.length, rightRows.length);
  for (let index = 0; index < rowCount; index += 1) {
    const left = leftRows[index]?.element ?? <Text> </Text>;
    const right = rightRows[index]?.element ?? <Text> </Text>;
    combined.push({
      key: `wide:${leftRows[index]?.key ?? 'empty'}:${rightRows[index]?.key ?? 'empty'}:${index}`,
      element: (
        <Box flexDirection="row">
          <Box width={leftWidth}>{left}</Box>
          <Box marginLeft={2} width={rightWidth}>
            {right}
          </Box>
        </Box>
      ),
    });
  }
  return combined;
}

function calendarWeeks(cells: SkillUsageHeatmapCell[]): CalendarWeek[] {
  if (cells.length === 0) return [];
  const byDate = new Map(cells.map((cell) => [cell.date, cell]));
  const first = parseDate(cells[0].date);
  const last = parseDate(cells[cells.length - 1].date);
  const cursor = new Date(first);
  cursor.setUTCDate(cursor.getUTCDate() - cursor.getUTCDay());
  const weeks: CalendarWeek[] = [];

  while (cursor <= last) {
    const days: Array<SkillUsageHeatmapCell | null> = [];
    let monthLabel: string | undefined;
    for (let day = 0; day < 7; day += 1) {
      const date = formatDate(cursor);
      const cell = byDate.get(date) ?? null;
      days.push(cell);
      if (cell && (weeks.length === 0 || new Date(`${date}T00:00:00.000Z`).getUTCDate() <= 7)) {
        monthLabel ??= formatMonth(date);
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push({ monthLabel, days });
  }

  return weeks;
}

function renderSelectedDayDetail(
  provider: ProviderSkillUsageOverview,
  cell: SkillUsageHeatmapCell | undefined,
  dayRows: ProviderSkillUsageRow[],
  columns: number,
): UsageContentRow[] {
  const date = cell?.date ?? 'No date selected';
  const counted = cell?.countedInvocations ?? 0;
  const failed = cell?.failedInvocations ?? 0;
  const result: UsageContentRow[] = [
    { key: 'detail:heading', element: <Text dimColor>Selected day</Text> },
    {
      key: 'detail:summary',
      element: (
        <Text>
          {date} · {provider.displayName}
        </Text>
      ),
    },
    {
      key: 'detail:counts',
      element: (
        <Text>
          Counted {counted} · Failed {failed}
        </Text>
      ),
    },
  ];

  if (dayRows.length === 0) {
    result.push({ key: 'detail:empty', element: <Text dimColor>No skill usage on this day.</Text> });
    return result;
  }

  const widths = usageTableWidths(columns, false);
  result.push({
    key: 'detail:header',
    element: (
      <Text dimColor>
        {fitCell('Skill', widths.skill)} {fitCell('Counted', widths.counted)} {fitCell('Failed', widths.failed)}{' '}
        {fitCell('Source Path', widths.sourcePath)}
      </Text>
    ),
  });
  for (const row of dayRows) {
    result.push({
      key: `detail:${row.skillName}`,
      element: (
        <Text>
          {fitCell(row.skillName, widths.skill)} {fitCell(String(row.countedInvocations), widths.counted)}{' '}
          {fitCell(formatFailed(row.failedInvocations), widths.failed)}{' '}
          {fitCell(formatSourcePath(row.sourcePath), widths.sourcePath)}
        </Text>
      ),
    });
  }
  return result;
}

function renderRankingTable(provider: ProviderSkillUsageOverview, columns: number): UsageContentRow[] {
  const result: UsageContentRow[] = [{ key: 'ranking:heading', element: <Text dimColor>Provider Skill Ranking</Text> }];
  if (provider.ranking.length === 0) {
    result.push({ key: 'ranking:empty', element: <Text dimColor>No usage records for this provider and range.</Text> });
    return result;
  }

  const widths = usageTableWidths(columns, true);
  result.push({
    key: 'ranking:header',
    element: (
      <Text dimColor>
        {fitCell('Skill', widths.skill)} {fitCell('Counted', widths.counted)} {fitCell('Failed', widths.failed)}{' '}
        {fitCell('Last Used', widths.lastUsed)} {fitCell('Source Path', widths.sourcePath)}
      </Text>
    ),
  });
  for (const row of provider.ranking) {
    result.push({
      key: `ranking:${row.skillName}`,
      element: (
        <Text>
          {fitCell(row.skillName, widths.skill)} {fitCell(String(row.countedInvocations), widths.counted)}{' '}
          {fitCell(formatFailed(row.failedInvocations), widths.failed)}{' '}
          {fitCell(formatLastUsed(row.lastInvokedAt), widths.lastUsed)}{' '}
          {fitCell(formatSourcePath(row.sourcePath), widths.sourcePath)}
        </Text>
      ),
    });
  }
  return result;
}

function usageTableWidths(
  columns: number,
  withLastUsed: boolean,
): { skill: number; counted: number; failed: number; lastUsed: number; sourcePath: number } {
  const contentWidth = Math.max(40, columns - 2);
  const counted = 7;
  const failed = 6;
  const lastUsed = withLastUsed ? 10 : 0;
  const gaps = withLastUsed ? 4 : 3;
  const fixed = counted + failed + lastUsed + gaps;
  const skill = Math.max(16, Math.min(32, Math.floor((contentWidth - fixed) * 0.4)));
  const sourcePath = Math.max(12, contentWidth - skill - fixed);
  return { skill, counted, failed, lastUsed, sourcePath };
}

function appendErrors(rows: UsageContentRow[], input: { usageImportError: string | null; error: string | null }) {
  if (input.usageImportError)
    rows.push({ key: 'error:import', element: <Text color="red">{input.usageImportError}</Text> });
  if (input.error) rows.push({ key: 'error:view', element: <Text color="red">{input.error}</Text> });
}

function formatHeatmapCell(cell: SkillUsageHeatmapCell, selected: boolean): string {
  const glyph = cell.countedInvocations === 0 ? '□' : '■';
  return selected ? `[${glyph}]` : ` ${glyph} `;
}

function heatmapColor(cell: SkillUsageHeatmapCell, maxCount: number): string | undefined {
  if (cell.countedInvocations === 0) return undefined;
  const ratio = maxCount === 0 ? 0 : cell.countedInvocations / maxCount;
  if (ratio >= 0.75) return 'redBright';
  if (ratio >= 0.5) return 'magenta';
  if (ratio >= 0.25) return 'cyan';
  return 'blue';
}

function moveDateWithinRange(
  date: string | null,
  overview: SkillUsageOverview | null,
  deltaMs: number,
  cells: SkillUsageHeatmapCell[] | undefined = [],
  snapToNearestTargetWeekDate = false,
): string | null {
  if (!overview) return date;
  const current = parseDate(date ?? overview.range.to);
  const next = new Date(current.getTime() + deltaMs);
  const nextDate = formatDate(next);
  const selectableDates = (cells ?? []).map((cell) => cell.date).sort();
  if (selectableDates.includes(nextDate)) return nextDate;
  if (snapToNearestTargetWeekDate) {
    const nearestDate = nearestDateInTargetWeek(next, selectableDates);
    if (nearestDate) return nearestDate;
  }
  if (nextDate < overview.range.from || nextDate > overview.range.to) return date ?? overview.range.to;
  return nextDate;
}

function nearestDateInTargetWeek(target: Date, selectableDates: string[]): string | null {
  const targetWeekStart = startOfUtcWeek(target);
  const candidates = selectableDates.filter(
    (date) => startOfUtcWeek(parseDate(date)).getTime() === targetWeekStart.getTime(),
  );
  if (candidates.length === 0) return null;
  const targetTime = target.getTime();
  return candidates.sort(
    (left, right) =>
      Math.abs(parseDate(left).getTime() - targetTime) - Math.abs(parseDate(right).getTime() - targetTime) ||
      left.localeCompare(right),
  )[0];
}

function startOfUtcWeek(date: Date): Date {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return start;
}

function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatMonth(date: string): string {
  return parseDate(date).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
}

function formatFailed(value: number): string {
  return value === 0 ? '-' : String(value);
}

function formatLastUsed(value: string | undefined): string {
  return value ? value.slice(0, 10) : '-';
}

function formatSourcePath(value: string | undefined): string {
  return value ?? '-';
}
