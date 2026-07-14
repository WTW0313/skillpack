import { useMemo } from 'react';
import Fuse from 'fuse.js';

const DEFAULT_SEARCH_KEYS = ['name', 'description'];

export function useSearch<T>(items: T[], query: string, keys = DEFAULT_SEARCH_KEYS): T[] {
  const fuse = useMemo(() => new Fuse(items, { keys, threshold: 0.4 }), [items, keys]);

  return useMemo(() => {
    if (!query) return items;
    return fuse.search(query).map((result) => result.item);
  }, [fuse, items, query]);
}
