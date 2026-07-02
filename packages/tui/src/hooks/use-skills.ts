import { useMemo } from 'react';
import { useAppContext } from '../context/app-context.js';
import { useSearch } from './use-search.js';
import type { SkillGroup, SkillInventoryInstance, InventoryIssue, InventoryNotice } from '@skillpack/core';

const TAB_PROVIDER_MAP: Record<string, string | null> = {
  All: null,
  Codex: 'codex',
  Claude: 'claude',
  Global: 'global',
};

export const TABS = Object.keys(TAB_PROVIDER_MAP);

export interface InventoryListRow {
  id: string;
  group: SkillGroup;
  instance: SkillInventoryInstance;
  relatedProviders: Array<{
    provider: string;
    enabled: boolean;
  }>;
  issues: InventoryIssue[];
  notices: InventoryNotice[];
}

const PROVIDER_ORDER = ['codex', 'claude', 'global'];
const ROW_SEARCH_KEYS = [
  'instance.name',
  'instance.description',
  'instance.provider',
  'group.identity.reasons',
  'group.notices.message',
  'instance.issues.message',
  'instance.notices.message',
];

function providerRank(provider: string): number {
  const rank = PROVIDER_ORDER.indexOf(provider);
  return rank === -1 ? PROVIDER_ORDER.length : rank;
}

function rowId(group: SkillGroup, instance: SkillInventoryInstance): string {
  return `${group.id}:${instance.provider}:${instance.path}`;
}

function toRows(inventory: SkillGroup[], provider: string | null): InventoryListRow[] {
  const sortedGroups = [...inventory].sort((a, b) => a.name.localeCompare(b.name));
  return sortedGroups.flatMap((group) => {
    const instances = [...group.instances]
      .filter((instance) => provider === null || instance.provider === provider)
      .sort((a, b) => providerRank(a.provider) - providerRank(b.provider) || a.path.localeCompare(b.path));

    return instances.map((instance) => ({
      id: rowId(group, instance),
      group,
      instance,
      relatedProviders: group.identity.confidence === 'confirmed'
        ? group.providers.filter((related) => related.provider !== instance.provider)
        : [],
      issues: instance.issues,
      notices: instance.notices,
    }));
  });
}

export function useFilteredSkills(): { skills: InventoryListRow[]; tabs: string[] } {
  const { inventory, activeTab, searchQuery } = useAppContext();

  const tabFiltered = useMemo(() => {
    const provider = TAB_PROVIDER_MAP[activeTab];
    return toRows(inventory, provider);
  }, [inventory, activeTab]);

  const filtered = useSearch(tabFiltered, searchQuery, ROW_SEARCH_KEYS);

  return { skills: filtered, tabs: TABS };
}
