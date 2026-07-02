import { useMemo } from 'react';
import { useAppContext } from '../context/app-context.js';
import { useSearch } from './use-search.js';
import type { SkillGroup } from '@skillpack/core';

const TAB_PROVIDER_MAP: Record<string, string | null> = {
  All: null,
  Codex: 'codex',
  Claude: 'claude',
  Global: 'global',
};

export const TABS = Object.keys(TAB_PROVIDER_MAP);

const GROUP_SEARCH_KEYS = ['name', 'identity.reasons', 'instances.description', 'instances.provider', 'healthSignals.message'];

export function useFilteredSkills(): { skills: SkillGroup[]; tabs: string[] } {
  const { inventory, activeTab, searchQuery } = useAppContext();

  const tabFiltered = useMemo(() => {
    const provider = TAB_PROVIDER_MAP[activeTab];
    if (provider === null) return inventory;
    return inventory.filter((group) => group.instances.some((instance) => instance.provider === provider));
  }, [inventory, activeTab]);

  const filtered = useSearch(tabFiltered, searchQuery, GROUP_SEARCH_KEYS);

  return { skills: filtered, tabs: TABS };
}
