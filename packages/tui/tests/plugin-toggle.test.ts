import { describe, expect, it } from 'vitest';
import { formatPluginToggleMessage } from '../src/lib/plugin-toggle.js';
import type { Skill } from '@skillpack/core';

function pluginSkill(provider: string, name: string): Pick<Skill, 'name' | 'provider' | 'origin'> {
  return {
    name,
    provider,
    origin: {
      type: 'plugin',
      pluginId: 'deploy-plugin@team-tools',
      pluginName: 'deploy-plugin',
      marketplace: 'team-tools',
      pluginEnabled: true,
    },
  };
}

describe('formatPluginToggleMessage', () => {
  it('uses provider-agnostic wording for plugin-owned skills', () => {
    const skill = pluginSkill('claude', 'deploy');
    const message = formatPluginToggleMessage(skill, [
      skill,
      pluginSkill('claude', 'audit'),
    ]);

    expect(message).toBe('Disable plugin deploy-plugin@team-tools? This affects 2 skills: audit, deploy.');
    expect(message).not.toContain('Codex');
  });
});
