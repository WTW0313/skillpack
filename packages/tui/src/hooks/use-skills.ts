import { useMemo } from 'react';
import { useAppContext } from '../context/app-context.js';
import { useSearch } from './use-search.js';
import type { Skill } from '@skillpack/core';

const TAB_PROVIDER_MAP: Record<string, string | null> = {
  All: null,
  Codex: 'codex',
  Claude: 'claude',
  Global: 'global',
};

export const TABS = Object.keys(TAB_PROVIDER_MAP);

export function useFilteredSkills(): { skills: Skill[]; tabs: string[] } {
  const { skills, activeTab, searchQuery } = useAppContext();

  const tabFiltered = useMemo(() => {
    const provider = TAB_PROVIDER_MAP[activeTab];
    const inventorySkills = skills.filter((s) => s.scope !== 'project');
    if (provider === null) return inventorySkills;
    return inventorySkills.filter((s) => s.provider === provider);
  }, [skills, activeTab]);

  const filtered = useSearch(tabFiltered, searchQuery);

  return { skills: filtered, tabs: TABS };
}
