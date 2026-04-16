import { describe, it, expect } from 'vitest';
import { DuplicateDetector } from '../src/duplicates.js';
import type { Skill } from '../src/models/index.js';

function makeSkill(name: string, provider: string): Skill {
  return { name, description: '', provider, path: `/fake/${provider}/${name}`, enabled: true, scope: 'global', metadata: {} };
}

describe('DuplicateDetector', () => {
  const detector = new DuplicateDetector();

  it('detects no duplicates when names are unique', () => {
    expect(detector.detect([makeSkill('a', 'codex'), makeSkill('b', 'cursor')])).toHaveLength(0);
  });

  it('detects duplicate when same name across providers', () => {
    const duplicates = detector.detect([makeSkill('figma', 'codex'), makeSkill('figma', 'cursor'), makeSkill('other', 'codex')]);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].skillName).toBe('figma');
    expect(duplicates[0].instances).toHaveLength(2);
  });

  it('detects multiple duplicates', () => {
    const duplicates = detector.detect([makeSkill('a', 'codex'), makeSkill('a', 'cursor'), makeSkill('b', 'codex'), makeSkill('b', 'claude'), makeSkill('b', 'global')]);
    expect(duplicates).toHaveLength(2);
    expect(duplicates.find((d) => d.skillName === 'b')?.instances).toHaveLength(3);
  });
});
