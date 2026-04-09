import { useMemo } from 'react';
import Fuse from 'fuse.js';
import type { Skill } from '@skillpack/core';

export function useSearch(skills: Skill[], query: string): Skill[] {
  const fuse = useMemo(
    () => new Fuse(skills, { keys: ['name', 'description'], threshold: 0.4 }),
    [skills],
  );

  return useMemo(() => {
    if (!query) return skills;
    return fuse.search(query).map((result) => result.item);
  }, [fuse, skills, query]);
}
