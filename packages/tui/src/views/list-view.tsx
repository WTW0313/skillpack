import { useState, useEffect, useMemo, useRef } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Spinner } from '@inkjs/ui';
import { useAppContext } from '../context/app-context.js';
import { useFilteredSkills, TABS } from '../hooks/use-skills.js';
import { useTerminalSize } from '../hooks/use-terminal-size.js';
import { TabBar } from '../components/tab-bar.js';
import { SkillRow } from '../components/skill-row.js';
import { SearchInput } from '../components/search-input.js';
import { StatusBar } from '../components/status-bar.js';
import { fitCell, getGlyphSet, getInventoryLayout } from '../lib/responsive-layout.js';

export function ListView() {
  const { exit } = useApp();
  const {
    loading, activeTab, setActiveTab, setView, setSelectedGroup, setSelectedSkill,
    searchQuery, setSearchQuery, refresh, inventory,
  } = useAppContext();
  const { skills, tabs } = useFilteredSkills();
  const { columns, rows } = useTerminalSize();
  const [cursor, setCursor] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [searching, setSearching] = useState(false);
  const glyphs = getGlyphSet();

  const prevSkillsLenRef = useRef(skills.length);

  const layout = getInventoryLayout({
    size: { columns, rows },
    searching,
    hasSearchQuery: Boolean(searchQuery),
    skillCount: skills.length,
  });
  const visibleRows = layout.visibleRows;

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
    for (const tab of TABS) {
      if (tab === 'All') {
        counts[tab] = inventory.reduce((count, group) => count + group.instances.length, 0);
      } else {
        const providerMap: Record<string, string> = {
          Codex: 'codex', Claude: 'claude', Global: 'global',
        };
        counts[tab] = inventory.reduce(
          (count, group) => count + group.instances.filter((instance) => instance.provider === providerMap[tab]).length,
          0,
        );
      }
    }
    return counts;
  }, [inventory]);

  useInput((input, key) => {
    if (input === 'q') { exit(); return; }
    if (key.escape && searchQuery) {
      setSearchQuery('');
      return;
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(c + 1, Math.max(0, skills.length - 1)));
      return;
    }
    if (key.upArrow) {
      setCursor((c) => Math.max(c - 1, 0));
      return;
    }
    if (input === '/') { setSearching(true); return; }
    if (input === 'p') { setView('project'); return; }
    if (input === 's') { setView('settings'); return; }
    if (input === 'i') { setView('install'); return; }
    if (input === 'u') { setView('updates'); return; }
    if (key.return && skills[cursor]) {
      setSelectedGroup(skills[cursor].group);
      setSelectedSkill(skills[cursor].instance);
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
  const scrollBarHeight = showScroll
    ? Math.max(1, Math.round(visibleRows * (visibleRows / skills.length)))
    : 0;
  const scrollBarOffset = skills.length <= visibleRows
    ? 0
    : Math.round(scrollOffset / (skills.length - visibleRows) * (visibleRows - scrollBarHeight));

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Header */}
      <Box paddingX={1}>
        <Text bold color="magenta">{glyphs.brand} Skillpack</Text>
        <Text dimColor>  {skills.length} instance{skills.length !== 1 ? 's' : ''}</Text>
        {showScroll && (
          <Text dimColor>  {scrollOffset + 1}–{Math.min(scrollOffset + visibleRows, skills.length)} of {skills.length}</Text>
        )}
      </Box>

      {/* Tabs */}
      <Box>
        <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} counts={tabCounts} />
      </Box>

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
          <Text dimColor>{fitCell('NAME', layout.columns.name)}</Text>
          <Text dimColor>{fitCell('PROVIDER', layout.columns.provider)}</Text>
          <Text dimColor>{fitCell('STATUS', layout.columns.state)}</Text>
          <Text dimColor>{fitCell('RELATED', layout.columns.related)}</Text>
          <Text dimColor>{fitCell('ISSUE', layout.columns.issue)}</Text>
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
                key={skill.id}
                skill={skill}
                isSelected={scrollOffset + index === cursor}
                columns={layout.columns}
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
