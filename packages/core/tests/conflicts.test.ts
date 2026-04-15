import { describe, it, expect } from 'vitest';
import { ConflictDetector } from '../src/conflicts.js';
import type { Skill } from '../src/models/index.js';

function makeSkill(name: string, provider: string): Skill {
  return { name, description: '', provider, path: `/fake/${provider}/${name}`, enabled: true, scope: 'global', readonly: true, metadata: {} };
}

describe('ConflictDetector', () => {
  const detector = new ConflictDetector();

  it('detects no conflicts when names are unique', () => {
    expect(detector.detect([makeSkill('a', 'codex'), makeSkill('b', 'cursor')])).toHaveLength(0);
  });

  it('detects conflict when same name across providers', () => {
    const conflicts = detector.detect([makeSkill('figma', 'codex'), makeSkill('figma', 'cursor'), makeSkill('other', 'codex')]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].skillName).toBe('figma');
    expect(conflicts[0].instances).toHaveLength(2);
  });

  it('detects multiple conflicts', () => {
    const conflicts = detector.detect([makeSkill('a', 'codex'), makeSkill('a', 'cursor'), makeSkill('b', 'codex'), makeSkill('b', 'claude'), makeSkill('b', 'global')]);
    expect(conflicts).toHaveLength(2);
    expect(conflicts.find((c) => c.skillName === 'b')?.instances).toHaveLength(3);
  });
});
