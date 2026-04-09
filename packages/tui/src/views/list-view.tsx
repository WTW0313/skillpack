import { useState, useEffect, useMemo } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Spinner } from '@inkjs/ui';
import { useAppContext } from '../context/app-context.js';
import { useFilteredSkills } from '../hooks/use-skills.js';
import { useTerminalSize } from '../hooks/use-terminal-size.js';
import { TabBar } from '../components/tab-bar.js';
import { SkillRow } from '../components/skill-row.js';
import { SearchInput } from '../components/search-input.js';
import { StatusBar } from '../components/status-bar.js';

const HEADER_LINES = 1;
const TAB_LINES = 1;
const COL_HEADER_LINES = 1;
const STATUS_LINES = 2;
const MARGIN_LINES = 2;

export function ListView() {
  const { exit } = useApp();
  const {
    loading, activeTab, setActiveTab, setView, setSelectedSkill,
    setSearchQuery, refresh, manager,
  } = useAppContext();
  const { skills, tabs } = useFilteredSkills();
  const { rows } = useTerminalSize();
  const [cursor, setCursor] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [searching, setSearching] = useState(false);

  const searchLines = searching ? 2 : 0;
  const visibleRows = Math.max(1, rows - HEADER_LINES - TAB_LINES - COL_HEADER_LINES - STATUS_LINES - MARGIN_LINES - searchLines);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { setCursor(0); setScrollOffset(0); }, [activeTab]);

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

  useInput((input, key) => {
    if (input === 'q') { exit(); return; }
    if (input === 'j' || key.downArrow) {
      setCursor((c) => Math.min(c + 1, skills.length - 1));
      return;
    }
    if (input === 'k' || key.upArrow) {
      setCursor((c) => Math.max(c - 1, 0));
      return;
    }
    if (input === 'g') { setCursor(0); return; }
    if (input === 'G') { setCursor(Math.max(0, skills.length - 1)); return; }
    if (input === '/') { setSearching(true); return; }
    if (input === 'i') { setView('install'); return; }
    if (input === 'c') { setView('create'); return; }
    if (input === 'u') { setView('update'); return; }
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
    return <Box><Spinner label="Scanning skills..." /></Box>;
  }

  const showScrollIndicator = skills.length > visibleRows;
  const scrollPercent = skills.length <= visibleRows
    ? 100
    : Math.round((scrollOffset / (skills.length - visibleRows)) * 100);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box paddingX={1}>
        <Text bold color="cyan">skillpack</Text>
        <Text dimColor> — {skills.length} skills</Text>
        {showScrollIndicator && (
          <Text dimColor>  [{scrollOffset + 1}-{Math.min(scrollOffset + visibleRows, skills.length)}/{skills.length}]</Text>
        )}
      </Box>

      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {searching && (
        <Box>
          <SearchInput
            onChange={setSearchQuery}
            onSubmit={() => setSearching(false)}
            onCancel={() => { setSearching(false); setSearchQuery(''); }}
          />
        </Box>
      )}

      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {skills.length === 0 ? (
          <Text dimColor>No skills found</Text>
        ) : (<>
          <Box gap={1}>
            <Text dimColor>{' '}</Text>
            <Text dimColor bold>{'Name'.padEnd(30)}</Text>
            <Text dimColor bold>{'Provider'.padEnd(10)}</Text>
            <Text dimColor bold>{'Status'}</Text>
          </Box>
          {visibleSkills.map((skill, index) => (
            <SkillRow
              key={`${skill.provider}:${skill.name}`}
              skill={skill}
              isSelected={scrollOffset + index === cursor}
              isConflicting={manager.isConflicting(skill.name)}
            />
          ))}
        </>)}
      </Box>

      <StatusBar />
    </Box>
  );
}
