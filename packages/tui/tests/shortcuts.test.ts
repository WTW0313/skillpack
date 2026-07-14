import { describe, expect, it } from 'vite-plus/test';
import { getShortcutsForView } from '../src/lib/shortcuts.js';
import type { SkillInventoryInstance } from '@skillpack/core';

function skill(provider: string): SkillInventoryInstance {
  return {
    name: 'demo',
    description: '',
    provider,
    path: `/fake/${provider}/demo`,
    enabled: true,
    source: { type: 'skillssh' },
    actions: provider === 'global' ? ['update', 'remove'] : [],
    issues: [],
    notices: [],
  };
}

describe('getShortcutsForView', () => {
  it('shows the manual Updates section shortcut in the list', () => {
    const shortcuts = getShortcutsForView({ view: 'list', selectedSkill: null, canToggle: false });

    expect(shortcuts.map((shortcut) => shortcut.key)).toContain('u');
  });

  it('shows the Usage section shortcut in the list', () => {
    const shortcuts = getShortcutsForView({ view: 'list', selectedSkill: null, canToggle: false });

    expect(shortcuts.map((shortcut) => shortcut.key)).toContain('g');
  });

  it('shows Detail update shortcut only for skills.sh-managed Global Skills', () => {
    const codexShortcuts = getShortcutsForView({ view: 'detail', selectedSkill: skill('codex'), canToggle: false });
    const globalShortcuts = getShortcutsForView({ view: 'detail', selectedSkill: skill('global'), canToggle: false });

    expect(codexShortcuts.map((shortcut) => shortcut.key)).not.toContain('u');
    expect(globalShortcuts.map((shortcut) => shortcut.key)).toContain('u');
  });
});
