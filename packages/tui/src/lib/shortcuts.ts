import type { SkillInventoryInstance } from '@skillpack/core';
import type { ViewType } from '../context/app-context.js';
import type { ShortcutLayoutItem } from './responsive-layout.js';

export interface Shortcut extends ShortcutLayoutItem {}

const SHORTCUTS: Record<string, Shortcut[]> = {
  list: [
    { key: '↑↓', label: 'nav' },
    { key: 'enter', label: 'detail' },
    { key: '/', label: 'search', compactLabel: 'find' },
    { key: '?', label: 'help' },
    { key: 'tab', label: 'tabs' },
    { key: 'g', label: 'usage' },
    { key: 'p', label: 'project' },
    { key: 's', label: 'settings' },
    { key: 'i', label: 'install' },
    { key: 'u', label: 'updates' },
    { key: 'q', label: 'quit' },
  ],
  usage: [
    { key: 'esc', label: 'back' },
    { key: '?', label: 'help' },
    { key: 'tab', label: 'provider' },
    { key: '1/2/3', label: 'range' },
    { key: '↑↓', label: 'day' },
    { key: '←→', label: 'week' },
    { key: 'pg', label: 'scroll' },
    { key: 'r', label: 'rescan' },
    { key: 'x', label: 'reset' },
    { key: 'q', label: 'quit' },
  ],
  install: [
    { key: 'esc', label: 'back' },
    { key: '?', label: 'help' },
    { key: '↑↓', label: 'navigate', compactLabel: 'nav' },
    { key: 'enter', label: 'select' },
  ],
  project: [
    { key: 'esc', label: 'back' },
    { key: '?', label: 'help' },
    { key: '↑↓', label: 'navigate', compactLabel: 'nav' },
    { key: 'q', label: 'quit' },
  ],
  settings: [
    { key: 'esc', label: 'back' },
    { key: '?', label: 'help' },
    { key: '↑↓', label: 'scroll' },
    { key: 'q', label: 'quit' },
  ],
  updates: [
    { key: 'esc', label: 'back' },
    { key: '?', label: 'help' },
    { key: 'enter', label: 'check/apply', compactLabel: 'apply' },
    { key: 'r', label: 'recheck' },
    { key: '↑↓', label: 'navigate', compactLabel: 'nav' },
    { key: 'q', label: 'quit' },
  ],
};

const DETAIL_BASE: Shortcut[] = [
  { key: 'esc', label: 'back' },
  { key: '?', label: 'help' },
  { key: 'tab', label: 'sections' },
  { key: '←→', label: 'provider instance', compactLabel: 'provider' },
];

const DETAIL_TAIL: Shortcut[] = [{ key: 'o', label: 'open folder', compactLabel: 'open' }];

interface ShortcutContext {
  view: ViewType;
  selectedSkill: SkillInventoryInstance | null;
  canToggle: boolean;
}

export function getShortcutsForView({ view, selectedSkill, canToggle }: ShortcutContext): Shortcut[] {
  if (view !== 'detail') return SHORTCUTS[view] ?? [];

  const sourceType = selectedSkill?.source?.type;
  const isUpdatable = selectedSkill?.provider === 'global' && sourceType === 'skillssh';
  const isRemovable = selectedSkill?.provider === 'global' && sourceType === 'skillssh';
  const detailBase = canToggle
    ? [
        ...DETAIL_BASE,
        {
          key: 'space',
          label: selectedSkill?.origin?.type === 'plugin' ? 'toggle plugin' : 'toggle',
          compactLabel: 'toggle',
        },
      ]
    : DETAIL_BASE;
  const tail = isRemovable ? [...DETAIL_TAIL, { key: 'd', label: 'delete' }] : DETAIL_TAIL;

  return isUpdatable
    ? [...detailBase, { key: 'u', label: 'check update', compactLabel: 'update' }, ...tail]
    : [...detailBase, ...tail];
}
