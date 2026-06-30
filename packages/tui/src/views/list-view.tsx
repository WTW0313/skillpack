import { useState, useEffect, useMemo, useRef } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Spinner } from '@inkjs/ui';
import path from 'node:path';
import { useAppContext } from '../context/app-context.js';
import { useFilteredSkills, TABS } from '../hooks/use-skills.js';
import { useTerminalSize } from '../hooks/use-terminal-size.js';
import { TabBar } from '../components/tab-bar.js';
import { SkillRow, COL_NAME_WIDTH, COL_AGENT_WIDTH } from '../components/skill-row.js';
import { SearchInput } from '../components/search-input.js';
import { StatusBar } from '../components/status-bar.js';

const CHROME_LINES = 8;

function formatScanPath(scanPath: { provider?: string; path: string; exists: boolean }): string {
  const relativePath = path.relative(process.cwd(), scanPath.path);
  const homeDir = process.env.HOME;
  const homePath = homeDir && scanPath.path.startsWith(`${homeDir}${path.sep}`)
    ? scanPath.path.replace(homeDir, '~')
    : scanPath.path;
  const displayPath = relativePath && !relativePath.startsWith('..') ? relativePath : homePath;
  return `${scanPath.provider ?? 'project'}:${displayPath}${scanPath.exists ? '' : ' (missing)'}`;
}

export function ListView() {
  const { exit } = useApp();
  const {
    loading, activeTab, setActiveTab, setView, setSelectedSkill,
    searchQuery, setSearchQuery, refresh, manager, skills: allSkills, scanPaths,
  } = useAppContext();
  const { skills, tabs } = useFilteredSkills();
  const { rows } = useTerminalSize();
  const [cursor, setCursor] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [searching, setSearching] = useState(false);

  const prevSkillsLenRef = useRef(skills.length);

  const searchLines = searching ? 2 : 0;
  const filterLines = (!searching && searchQuery) ? 1 : 0;
  const visibleRows = Math.max(1, rows - CHROME_LINES - searchLines - filterLines);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { setCursor(0); setScrollOffset(0); }, [activeTab]);

  useEffect(() => {
    if (skills.length !== prevSkillsLenRef.current) {
      setCursor(0);
      setScrollOffset(0);
      prevSkillsLenRef.current = skills.length;
    }
  }, [skills.length]);

  useEffect(() => {
    if (cursor < scrollOffset) {
      setScrollOffset(cursor);
    } else if (cursor >= scrollOffset + visibleRows) {
      setScrollOffset(cursor - visibleRows + 1);
    }
  }, [cursor, visibleRows, scrollOffset]);

  const visibleSkills = useMemo(
    () => skills.slice(scrollOffset, scrollOffset + visibleRows),
    [skills, scrollOffset, visibleRows],
  );

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const inventorySkills = allSkills.filter((s) => s.scope !== 'project');
    for (const tab of TABS) {
      if (tab === 'All') {
        counts[tab] = inventorySkills.length;
      } else {
        const providerMap: Record<string, string> = {
          Codex: 'codex', Claude: 'claude', Global: 'global',
        };
        counts[tab] = inventorySkills.filter((s) => s.provider === providerMap[tab]).length;
      }
    }
    return counts;
  }, [allSkills]);

  const providerRoots = useMemo(
    () => scanPaths.filter((scanPath) => scanPath.scope === 'provider').map(formatScanPath).join('  '),
    [scanPaths],
  );

  useInput((input, key) => {
    if (input === 'q') { exit(); return; }
    if (key.escape && searchQuery) {
      setSearchQuery('');
      return;
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(c + 1, skills.length - 1));
      return;
    }
    if (key.upArrow) {
      setCursor((c) => Math.max(c - 1, 0));
      return;
    }
    if (input === '/') { setSearching(true); return; }
    if (input === 'p') { setView('project'); return; }
    if (input === 'u') { setView('updates'); return; }
    if (input === 'i') { setView('install'); return; }
    
    if (input === ' ' && skills[cursor]) {
      manager.toggleSkill(skills[cursor]).then(() => refresh()).catch(() => {});
      return;
    }
    if (key.return && skills[cursor]) {
      setSelectedSkill(skills[cursor]);
      setView('detail');
      return;
    }
    if (key.tab) {
      const idx = tabs.indexOf(activeTab);
      const next = key.shift
        ? (idx - 1 + tabs.length) % tabs.length
        : (idx + 1) % tabs.length;
      setActiveTab(tabs[next]);
    }
  }, { isActive: !searching });

  if (loading) {
    return <Box><Spinner label="Scanning skills…" /></Box>;
  }

  const showScroll = skills.length > visibleRows;
  const scrollBarHeight = Math.max(1, Math.round(visibleRows * (visibleRows / skills.length)));
  const scrollBarOffset = skills.length <= visibleRows
    ? 0
    : Math.round(scrollOffset / (skills.length - visibleRows) * (visibleRows - scrollBarHeight));

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Header */}
      <Box paddingX={1}>
        <Text bold color="magenta">◆ skillpack</Text>
        <Text dimColor>  {skills.length} skill{skills.length !== 1 ? 's' : ''}</Text>
        {showScroll && (
          <Text dimColor>  {scrollOffset + 1}–{Math.min(scrollOffset + visibleRows, skills.length)} of {skills.length}</Text>
        )}
      </Box>

      {/* Tabs */}
      <Box>
        <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} counts={tabCounts} />
      </Box>

      {providerRoots && (
        <Box paddingX={1}>
          <Text dimColor>roots </Text>
          <Text dimColor wrap="truncate">{providerRoots}</Text>
        </Box>
      )}

      {/* Search input (active) */}
      {searching && (
        <Box marginTop={1} paddingX={1}>
          <SearchInput
            defaultValue={searchQuery}
            onChange={setSearchQuery}
            onSubmit={() => setSearching(false)}
            onCancel={() => { setSearching(false); setSearchQuery(''); }}
          />
        </Box>
      )}

      {/* Active filter indicator (when search bar is closed but query is active) */}
      {!searching && searchQuery && (
        <Box paddingX={1} marginTop={1}>
          <Text dimColor>filtered by </Text>
          <Text color="magenta" bold>"{searchQuery}"</Text>
          <Text dimColor>  esc to clear</Text>
        </Box>
      )}

      {/* Column headers */}
      <Box paddingX={1} marginTop={1}>
        <Box gap={1}>
          <Text>{' '}</Text>
          <Text dimColor>{'NAME'.padEnd(COL_NAME_WIDTH)}</Text>
          <Text dimColor>{'AGENT'.padEnd(COL_AGENT_WIDTH)}</Text>
          <Text dimColor>{'⏻'}</Text>
        </Box>
      </Box>

      {/* Skill list + scrollbar */}
      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" paddingX={1} flexGrow={1}>
          {skills.length === 0 ? (
            <Box marginTop={1}>
              {searchQuery ? (
                <>
                  <Text dimColor>  No matches for </Text>
                  <Text color="magenta">"{searchQuery}"</Text>
                  <Text dimColor>. Press </Text>
                  <Text bold>esc</Text>
                  <Text dimColor> to clear.</Text>
                </>
              ) : (
                <>
                  <Text dimColor>  No skills found. Press </Text>
                  <Text bold>i</Text>
                  <Text dimColor> to install or </Text>
                  <Text bold>p</Text>
                  <Text dimColor> for Project Skills.</Text>
                </>
              )}
            </Box>
          ) : (
            visibleSkills.map((skill, index) => (
              <SkillRow
                key={`${skill.provider}:${skill.name}`}
                skill={skill}
                isSelected={scrollOffset + index === cursor}
                isDuplicate={manager.isDuplicate(skill.name)}
              />
            ))
          )}
        </Box>

        {/* Scrollbar track */}
        {showScroll && (
          <Box flexDirection="column" width={1}>
            {Array.from({ length: visibleRows }, (_, i) => {
              const isThumb = i >= scrollBarOffset && i < scrollBarOffset + scrollBarHeight;
              return (
                <Text key={i} dimColor={!isThumb} color={isThumb ? 'magenta' : undefined}>
                  {isThumb ? '┃' : '│'}
                </Text>
              );
            })}
          </Box>
        )}
      </Box>

      <Box flexGrow={1} />
      <StatusBar />
    </Box>
  );
}
