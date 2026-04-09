import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LockfileManager } from '../src/lockfile.js';

describe('LockfileManager', () => {
  let dir: string;
  let lm: LockfileManager;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'skillpack-lock-'));
    lm = new LockfileManager(path.join(dir, 'skillpack.lock'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('creates a new lock file when none exists', async () => {
    await lm.load();
    expect(lm.getEntries()).toEqual({});
  });

  it('adds and persists an entry', async () => {
    await lm.load();
    lm.setEntry('my-skill', {
      source: 'github',
      repo: 'owner/repo',
      commit: 'abc123',
      installedAt: '2026-04-09T00:00:00Z',
      integrity: 'sha256-test',
    });
    await lm.save();

    const raw = JSON.parse(await readFile(path.join(dir, 'skillpack.lock'), 'utf-8'));
    expect(raw.skills['my-skill'].commit).toBe('abc123');
  });

  it('removes an entry', async () => {
    await lm.load();
    lm.setEntry('my-skill', {
      source: 'github',
      repo: 'owner/repo',
      commit: 'abc123',
      installedAt: '2026-04-09T00:00:00Z',
      integrity: 'sha256-test',
    });
    lm.removeEntry('my-skill');
    await lm.save();

    const raw = JSON.parse(await readFile(path.join(dir, 'skillpack.lock'), 'utf-8'));
    expect(raw.skills['my-skill']).toBeUndefined();
  });

  it('roundtrips load -> save -> load', async () => {
    await lm.load();
    lm.setEntry('a', { source: 'skillssh', identifier: 'pkg@a', version: '1.0.0', installedAt: '2026-04-09T00:00:00Z', integrity: 'sha256-aaa' });
    await lm.save();

    const lm2 = new LockfileManager(path.join(dir, 'skillpack.lock'));
    await lm2.load();
    const entry = lm2.getEntry('a');
    expect(entry?.version).toBe('1.0.0');
  });
});
