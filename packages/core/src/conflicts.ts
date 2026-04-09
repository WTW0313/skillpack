import type { Skill } from './models/index.js';
import type { ConflictInfo, DiffResult } from './models/conflict.js';

export class ConflictDetector {
  detect(skills: Skill[]): ConflictInfo[] {
    const groups = new Map<string, Skill[]>();
    for (const skill of skills) {
      const existing = groups.get(skill.name) ?? [];
      existing.push(skill);
      groups.set(skill.name, existing);
    }
    const conflicts: ConflictInfo[] = [];
    for (const [name, group] of groups) {
      if (group.length < 2) continue;
      conflicts.push({
        skillName: name,
        instances: group.map((s) => ({ provider: s.provider, path: s.path, version: s.version })),
      });
    }
    return conflicts;
  }

  diff(a: Skill, b: Skill): DiffResult {
    const changes: DiffResult['changes'] = [];
    if (a.description !== b.description) changes.push({ field: 'description', a: a.description, b: b.description });
    if (a.version !== b.version) changes.push({ field: 'version', a: a.version ?? '', b: b.version ?? '' });
    return { identical: changes.length === 0, changes };
  }
}
