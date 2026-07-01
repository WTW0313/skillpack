import path from 'node:path';

export function formatDisplayPath(value: string): string {
  const relativePath = path.relative(process.cwd(), value);
  const homeDir = process.env.HOME;
  const homePath = homeDir && value.startsWith(`${homeDir}${path.sep}`)
    ? value.replace(homeDir, '~')
    : value;
  return relativePath && !relativePath.startsWith('..') ? relativePath : homePath;
}
