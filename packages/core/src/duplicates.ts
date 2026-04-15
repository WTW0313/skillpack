import type { Skill } from './models/index.js';
import type { DuplicateInfo, DiffResult } from './models/duplicate.js';

export class DuplicateDetector {
  detect(skills: Skill[]): DuplicateInfo[] {
    const groups = new Map<string, Skill[]>();
    for (const skill of skills) {
      const existing = groups.get(skill.name) ?? [];
      existing.push(skill);
      groups.set(skill.name, existing);
    }
    const duplicates: DuplicateInfo[] = [];
    for (const [name, group] of groups) {
      if (group.length < 2) continue;
      duplicates.push({
        skillName: name,
        instances: group.map((s) => ({ provider: s.provider, path: s.path, version: s.version })),
      });
    }
    return duplicates;
  }

  diff(a: Skill, b: Skill): DiffResult {
    const changes: DiffResult['changes'] = [];
    if (a.description !== b.description) changes.push({ field: 'description', a: a.description, b: b.description });
    if (a.version !== b.version) changes.push({ field: 'version', a: a.version ?? '', b: b.version ?? '' });
    return { identical: changes.length === 0, changes };
  }
}
