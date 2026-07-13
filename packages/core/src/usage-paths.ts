import path from 'node:path';

type PathOperations = Pick<typeof path, 'isAbsolute' | 'relative' | 'sep'>;

export function isSupportedClaudeArtifactPath(
  root: string,
  file: string,
  pathOperations: PathOperations = path,
): boolean {
  const relative = pathOperations.relative(root, file);
  // Windows cross-volume and cross-share relative paths can remain absolute.
  if (!relative || relative.startsWith(`..${pathOperations.sep}`) || pathOperations.isAbsolute(relative)) return false;
  const parts = relative.split(pathOperations.sep);
  if (parts.length === 2) return parts[1].endsWith('.jsonl');
  return parts.length === 4
    && parts[2] === 'subagents'
    && /^agent-.*\.jsonl$/.test(parts[3]);
}
