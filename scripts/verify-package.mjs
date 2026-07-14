import { constants } from 'node:fs';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const coreDirectory = join(repositoryRoot, 'packages/core');
const tuiDirectory = join(repositoryRoot, 'packages/tui');
const coreDist = join(coreDirectory, 'dist');
const tuiDist = join(tuiDirectory, 'dist');
const cliPath = join(tuiDist, 'skillpack.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function assertExactFiles(directory, expectedFiles) {
  const files = (await readdir(directory)).sort((left, right) => left.localeCompare(right));
  assert(
    JSON.stringify(files) === JSON.stringify([...expectedFiles].sort((left, right) => left.localeCompare(right))),
    `${directory} contains ${files.join(', ') || 'no files'}; expected ${expectedFiles.join(', ')}`,
  );
}

await assertExactFiles(coreDist, ['index.d.ts', 'index.js']);
await assertExactFiles(tuiDist, ['skillpack.js']);

const [corePackage, tuiPackage, coreJavaScript, cliJavaScript, cliStats] = await Promise.all([
  readFile(join(coreDirectory, 'package.json'), 'utf8').then(JSON.parse),
  readFile(join(tuiDirectory, 'package.json'), 'utf8').then(JSON.parse),
  readFile(join(coreDist, 'index.js'), 'utf8'),
  readFile(cliPath, 'utf8'),
  stat(cliPath),
]);

assert(corePackage.main === './dist/index.js', 'Core main must point to ./dist/index.js.');
assert(corePackage.types === './dist/index.d.ts', 'Core types must point to ./dist/index.d.ts.');
assert(tuiPackage.type === 'module', 'The published CLI package must remain ESM.');
assert(tuiPackage.bin?.skillpack === './dist/skillpack.js', 'The skillpack bin must point to ./dist/skillpack.js.');
assert(cliJavaScript.startsWith('#!/usr/bin/env node\n'), 'The CLI must start with the Node.js shebang.');
assert(/^import\s/m.test(cliJavaScript), 'The CLI artifact must contain ESM imports.');
assert(!cliJavaScript.includes('sourceMappingURL='), 'The CLI artifact must not reference a source map.');
assert(!coreJavaScript.includes('sourceMappingURL='), 'The Core artifact must not reference a source map.');
assert((cliStats.mode & 0o111) !== 0, 'The CLI artifact must be executable.');
await access(cliPath, constants.X_OK);

execFileSync(process.execPath, ['--check', cliPath], { stdio: 'pipe' });
execFileSync(process.execPath, ['--check', join(coreDist, 'index.js')], { stdio: 'pipe' });

const packResult = JSON.parse(
  execFileSync('pnpm', ['pack', '--dry-run', '--json'], {
    cwd: tuiDirectory,
    encoding: 'utf8',
  }),
);
const packedFiles = packResult.files.map(({ path }) => path).sort((left, right) => left.localeCompare(right));
const expectedPackedFiles = ['LICENSE', 'README.md', 'dist/skillpack.js', 'package.json'].sort((left, right) =>
  left.localeCompare(right),
);
assert(
  JSON.stringify(packedFiles) === JSON.stringify(expectedPackedFiles),
  `Package would contain ${packedFiles.join(', ')}; expected ${expectedPackedFiles.join(', ')}`,
);

console.log('Verified Core, CLI, and npm package artifacts.');
