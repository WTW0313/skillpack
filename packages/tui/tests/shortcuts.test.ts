import { describe, expect, it } from 'vitest';
import { getShortcutsForView } from '../src/lib/shortcuts.js';
import type { Skill } from '@skillpack/core';

function skill(provider: string): Skill {
  return {
    name: 'demo',
    description: '',
    provider,
    path: `/fake/${provider}/demo`,
    enabled: true,
    scope: 'global',
    metadata: {},
    source: { type: 'skillssh' },
  };
}

describe('getShortcutsForView', () => {
  it('does not show a list update shortcut', () => {
    const shortcuts = getShortcutsForView({ view: 'list', selectedSkill: null, canToggle: false });

    expect(shortcuts.map((shortcut) => shortcut.key)).not.toContain('u');
  });

  it('shows Detail update shortcut only for skills.sh-managed Global Skills', () => {
    const codexShortcuts = getShortcutsForView({ view: 'detail', selectedSkill: skill('codex'), canToggle: false });
    const globalShortcuts = getShortcutsForView({ view: 'detail', selectedSkill: skill('global'), canToggle: false });

    expect(codexShortcuts.map((shortcut) => shortcut.key)).not.toContain('u');
    expect(globalShortcuts.map((shortcut) => shortcut.key)).toContain('u');
  });
});
