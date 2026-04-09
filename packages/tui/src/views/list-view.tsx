import { useState, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Spinner } from '@inkjs/ui';
import { useAppContext } from '../context/app-context.js';
import { useFilteredSkills } from '../hooks/use-skills.js';
import { TabBar } from '../components/tab-bar.js';
import { SkillRow } from '../components/skill-row.js';
import { SearchInput } from '../components/search-input.js';
import { StatusBar } from '../components/status-bar.js';

export function ListView() {
  const { exit } = useApp();
  const {
    loading, activeTab, setActiveTab, setView, setSelectedSkill,
    setSearchQuery, refresh, manager,
  } = useAppContext();
  const { skills, tabs } = useFilteredSkills();
  const [cursor, setCursor] = useState(0);
  const [searching, setSearching] = useState(false);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { setCursor(0); }, [activeTab]);

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

  return (
    <Box flexDirection="column">
      <Box paddingX={1} marginBottom={1}>
        <Text bold color="cyan">skillpack</Text>
        <Text dimColor> — {skills.length} skills</Text>
      </Box>

      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {searching && (
        <Box marginY={1}>
          <SearchInput
            onChange={setSearchQuery}
            onSubmit={() => setSearching(false)}
            onCancel={() => { setSearching(false); setSearchQuery(''); }}
          />
        </Box>
      )}

      <Box flexDirection="column" marginY={1}>
        {skills.length === 0 ? (
          <Text dimColor>  No skills found</Text>
        ) : (
          skills.map((skill, index) => (
            <SkillRow
              key={`${skill.provider}:${skill.name}`}
              skill={skill}
              isSelected={index === cursor}
              isConflicting={manager.isConflicting(skill.name)}
            />
          ))
        )}
      </Box>

      <StatusBar />
    </Box>
  );
}
