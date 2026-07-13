import { describe, expect, it } from 'vitest';
import { appendFile, mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SkillUsageManager } from '../src/usage.js';

describe('SkillUsageManager', () => {
  it('returns unsupported coverage without reading stale records', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const usageRoot = path.join(root, 'usage');
      await mkdir(path.join(usageRoot, 'invocations', 'codex'), { recursive: true });
      await writeFile(path.join(usageRoot, 'invocations', 'codex', '2026-07.jsonl'), JSON.stringify({
        schemaVersion: 1,
        recordId: 'stale',
        provider: 'codex',
        sessionId: 'session-a',
        turnId: 'turn-a',
        skillName: 'frontend-testing',
        identityConfidence: 'inferred',
        status: 'used',
        startedAt: '2026-07-07T08:00:00Z',
      }) + '\n', 'utf-8');
      const usage = new SkillUsageManager({
        dataDir: usageRoot,
        providers: [
          { provider: 'codex', displayName: 'Codex', supported: false },
        ],
      });

      await expect(usage.getOverview({
        rangeDays: 7,
        now: new Date('2026-07-08T00:00:00Z'),
      })).resolves.toEqual({
        range: {
          days: 7,
          from: '2026-07-02',
          to: '2026-07-08',
        },
        providers: [{
          provider: 'codex',
          displayName: 'Codex',
          coverageState: 'unsupported',
          coverageReasons: [],
          heatmap: [],
          dailySkillUsage: [],
          ranking: [],
          diagnostics: [],
        }],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns not-configured Claude coverage when Skill Attribution Roots are missing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const artifactRoot = path.join(root, 'claude-projects');
      await mkdir(artifactRoot, { recursive: true });
      const usage = new SkillUsageManager({
        dataDir: path.join(root, 'usage'),
        providers: [{
          provider: 'claude',
          displayName: 'Claude',
          supported: true,
          artifactRoots: [artifactRoot],
          skillRoots: [],
        }],
      });

      await expect(usage.getOverview({
        rangeDays: 7,
        now: new Date('2026-07-08T12:00:00Z'),
      })).resolves.toMatchObject({
        providers: [{
          provider: 'claude',
          coverageState: 'not-configured',
          coverageReasons: ['missing-attribution-roots'],
          diagnostics: [],
        }],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports every missing usage configuration prerequisite without an import result', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const usage = new SkillUsageManager({
        dataDir: path.join(root, 'usage'),
        providers: [{
          provider: 'claude',
          displayName: 'Claude',
          supported: true,
          configured: false,
          artifactRoots: [],
          skillRoots: [],
        }],
      });

      await expect(usage.importAllProviders()).resolves.toEqual([]);
      await expect(usage.getOverview({
        rangeDays: 7,
        now: new Date('2026-07-08T12:00:00Z'),
      })).resolves.toMatchObject({
        providers: [{
          provider: 'claude',
          coverageState: 'not-configured',
          coverageReasons: [
            'missing-artifact-roots',
            'missing-attribution-roots',
            'provider-not-configured',
          ],
          diagnostics: [],
        }],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('imports Codex skill reads from session and archived session JSONL using the stable scan rules', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const sessionsRoot = path.join(root, 'codex-sessions');
      const archivedRoot = path.join(root, 'archived_sessions');
      const usageRoot = path.join(root, 'usage');
      const difyRoot = path.join(root, 'dify');
      await mkdir(path.join(sessionsRoot, '2026', '07', '07'), { recursive: true });
      await mkdir(archivedRoot, { recursive: true });
      await mkdir(path.join(difyRoot, '.agents', 'skills', 'frontend-testing'), { recursive: true });
      await writeFile(path.join(difyRoot, '.agents', 'skills', 'frontend-testing', 'SKILL.md'), '---\nname: ignored-frontmatter-name\n---\n');

      await writeFile(path.join(sessionsRoot, '2026', '07', '07', 'rollout-session-a.jsonl'), jsonl([
        sessionMeta('session-a', path.join(root, 'other-project'), '2026-07-07T08:00:00Z'),
        taskStarted('turn-a', '2026-07-07T08:00:01Z'),
        turnContext('turn-a', difyRoot, '2026-07-07T08:00:02Z'),
        functionCall('call-a1', "sed -n '1,220p' .agents/skills/frontend-testing/SKILL.md", '2026-07-07T08:01:00Z'),
        functionOutput('call-a1', 0, '2026-07-07T08:01:01Z'),
        functionCall('call-a2', "sed -n '221,520p' .agents/skills/frontend-testing/SKILL.md", '2026-07-07T08:01:02Z'),
        functionOutput('call-a2', 0, '2026-07-07T08:01:03Z'),
        functionCall('call-a-rg', "rg 'SKILL.md' /Users/twwu/dify", '2026-07-07T08:02:00Z'),
        functionCall('call-a-python', "python3 -c 'print(\"/Users/twwu/dify/.agents/skills/not-invoked/SKILL.md\")'", '2026-07-07T08:02:01Z'),
        customToolCall('call-a-custom', "sed -n '1,240p' /Users/twwu/dify/.agents/skills/not-invoked/SKILL.md", '2026-07-07T08:02:02Z'),
        taskStarted('turn-b', '2026-07-07T09:00:00Z'),
        turnContext('turn-b', difyRoot, '2026-07-07T09:00:01Z'),
        functionCall('call-b1', "cat /Users/twwu/.agents/skills/vercel-react-best-practices/SKILL.md", '2026-07-07T09:01:00Z'),
        functionOutput('call-b1', 0, '2026-07-07T09:01:01Z'),
        taskStarted('turn-c', '2026-07-07T10:00:00Z'),
        turnContext('turn-c', path.join(root, 'other-project'), '2026-07-07T10:00:01Z'),
        functionCall('call-c1', "cat /Users/twwu/.agents/skills/other-project-only/SKILL.md", '2026-07-07T10:01:00Z'),
      ]));
      await writeFile(path.join(archivedRoot, 'rollout-session-b.jsonl'), jsonl([
        sessionMeta('session-b', path.join(root, 'other-project'), '2026-07-07T11:00:00Z'),
        taskStarted('turn-d', '2026-07-07T11:00:01Z'),
        turnContext('turn-d', difyRoot, '2026-07-07T11:00:02Z'),
        functionCall('call-d1', "nl -ba /Users/twwu/.codex/skills/.system/openai-docs/SKILL.md", '2026-07-07T11:01:00Z'),
        functionOutput('call-d1', 0, '2026-07-07T11:01:01Z'),
        functionCall('call-d2', "head /Users/twwu/.codex/plugins/cache/openai-curated-remote/github/0.1.5/skills/github/SKILL.md", '2026-07-07T11:02:00Z'),
        functionOutput('call-d2', 0, '2026-07-07T11:02:01Z'),
        functionCall('call-d3', "tail /Users/twwu/.codex/plugins/cache/openai-bundled/browser/26.623.141536/skills/control-in-app-browser/SKILL.md", '2026-07-07T11:03:00Z'),
        functionOutput('call-d3', 0, '2026-07-07T11:03:01Z'),
        taskStarted('turn-e', '2026-06-30T11:00:01Z'),
        turnContext('turn-e', difyRoot, '2026-06-30T11:00:02Z'),
        functionCall('call-e1', "bat /Users/twwu/.agents/skills/too-old/SKILL.md", '2026-06-30T11:01:00Z'),
        functionOutput('call-e1', 0, '2026-06-30T11:01:01Z'),
      ]));
      const usage = new SkillUsageManager({
        dataDir: usageRoot,
        now: new Date('2026-07-08T12:00:00Z'),
        providers: [
          {
            provider: 'codex',
            displayName: 'Codex',
            supported: true,
            artifactRoots: [sessionsRoot, archivedRoot],
          },
        ],
      });

      await expect(usage.importProvider('codex')).resolves.toEqual({
        provider: 'codex',
        importedRecords: 7,
        skippedArtifacts: 0,
        diagnostics: [],
      });

      const sevenDayOverview = await usage.getOverview({
        rangeDays: 7,
        now: new Date('2026-07-08T12:00:00Z'),
      });
      expect(sevenDayOverview.providers[0].provider).toBe('codex');
      expect(sevenDayOverview.providers[0].coverageState).toBe('active');
      expect(sevenDayOverview.providers[0].heatmap).toHaveLength(7);
      expect(sevenDayOverview.providers[0].heatmap.find((cell) => cell.date === '2026-07-07')).toMatchObject({
        countedInvocations: 6,
        failedInvocations: 0,
      });
      expect(sevenDayOverview.providers[0].ranking).toMatchObject([
        { skillName: 'browser:control-in-app-browser', countedInvocations: 1 },
        { skillName: 'github:github', countedInvocations: 1 },
        { skillName: 'openai-docs', countedInvocations: 1 },
        { skillName: 'other-project-only', countedInvocations: 1 },
        { skillName: 'vercel-react-best-practices', countedInvocations: 1 },
        { skillName: 'frontend-testing', countedInvocations: 1 },
      ]);

      const thirtyDayOverview = await usage.getOverview({
        rangeDays: 30,
        now: new Date('2026-07-08T12:00:00Z'),
      });
      expect(thirtyDayOverview.providers[0].ranking).toContainEqual(expect.objectContaining({
        skillName: 'too-old',
        countedInvocations: 1,
      }));

      await expect(usage.importProvider('codex')).resolves.toMatchObject({ importedRecords: 0 });
      const retainedOverview = await usage.getOverview({
        rangeDays: 30,
        now: new Date('2026-07-08T12:00:00Z'),
      });
      expect(retainedOverview.providers[0].ranking).toContainEqual(expect.objectContaining({
        skillName: 'too-old',
        countedInvocations: 1,
      }));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reads only usage log months that overlap the requested range', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const usageRoot = path.join(root, 'usage');
      const partitionRoot = path.join(usageRoot, 'invocations', 'codex');
      const historicalPartition = path.join(partitionRoot, '2025-12.jsonl');
      const requestedPartition = path.join(partitionRoot, '2026-07.jsonl');
      await mkdir(partitionRoot, { recursive: true });
      await writeFile(historicalPartition, JSON.stringify({
        schemaVersion: 1,
        recordId: 'historical',
        provider: 'codex',
        sessionId: 'session-old',
        turnId: 'turn-old',
        skillName: 'historical-skill',
        identityConfidence: 'inferred',
        status: 'used',
        startedAt: '2025-12-15T08:00:00Z',
      }) + '\n');
      await writeFile(requestedPartition, JSON.stringify({
        schemaVersion: 1,
        recordId: 'requested',
        provider: 'codex',
        sessionId: 'session-current',
        turnId: 'turn-current',
        skillName: 'requested-skill',
        identityConfidence: 'inferred',
        status: 'used',
        startedAt: '2026-07-07T08:00:00Z',
      }) + '\n');
      const oldAccessTime = new Date('2000-01-01T00:00:00.000Z');
      const oldModifiedTime = new Date('2020-01-01T00:00:00.000Z');
      await utimes(historicalPartition, oldAccessTime, oldModifiedTime);
      await utimes(requestedPartition, oldAccessTime, oldModifiedTime);
      const usage = new SkillUsageManager({
        dataDir: usageRoot,
        providers: [{
          provider: 'codex',
          displayName: 'Codex',
          supported: true,
          artifactRoots: [path.join(root, 'sessions')],
        }],
      });

      const overview = await usage.getOverview({
        rangeDays: 7,
        now: new Date('2026-07-08T12:00:00Z'),
      });

      expect(overview.providers[0].ranking).toMatchObject([
        { skillName: 'requested-skill', countedInvocations: 1 },
      ]);
      expect((await stat(requestedPartition)).atimeMs).toBeGreaterThan(oldAccessTime.getTime());
      expect((await stat(historicalPartition)).atimeMs).toBe(oldAccessTime.getTime());
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reads every usage log month crossed by the requested range', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const usageRoot = path.join(root, 'usage');
      const partitionRoot = path.join(usageRoot, 'invocations', 'codex');
      await mkdir(partitionRoot, { recursive: true });
      await writeFile(path.join(partitionRoot, '2026-07.jsonl'), JSON.stringify({
        schemaVersion: 1,
        recordId: 'july',
        provider: 'codex',
        sessionId: 'session-july',
        turnId: 'turn-july',
        skillName: 'july-skill',
        identityConfidence: 'inferred',
        status: 'used',
        startedAt: '2026-07-31T08:00:00Z',
      }) + '\n');
      await writeFile(path.join(partitionRoot, '2026-08.jsonl'), JSON.stringify({
        schemaVersion: 1,
        recordId: 'august',
        provider: 'codex',
        sessionId: 'session-august',
        turnId: 'turn-august',
        skillName: 'august-skill',
        identityConfidence: 'inferred',
        status: 'used',
        startedAt: '2026-08-01T08:00:00Z',
      }) + '\n');
      const usage = new SkillUsageManager({
        dataDir: usageRoot,
        providers: [{
          provider: 'codex',
          displayName: 'Codex',
          supported: true,
          artifactRoots: [path.join(root, 'sessions')],
        }],
      });

      const overview = await usage.getOverview({
        rangeDays: 7,
        now: new Date('2026-08-03T12:00:00Z'),
      });

      expect(overview.providers[0].ranking.map((row) => row.skillName)).toEqual([
        'august-skill',
        'july-skill',
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('records failed skill reads but excludes them from counted totals', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const sessionsRoot = path.join(root, 'codex-sessions');
      const difyRoot = path.join(root, 'dify');
      await mkdir(sessionsRoot, { recursive: true });
      await writeFile(path.join(sessionsRoot, 'session.jsonl'), jsonl([
        sessionMeta('session-a', difyRoot, '2026-07-07T08:00:00Z'),
        taskStarted('turn-a', '2026-07-07T08:00:01Z'),
        turnContext('turn-a', difyRoot, '2026-07-07T08:00:02Z'),
        functionCall('call-a1', "sed -n '1,220p' /Users/twwu/.agents/skills/frontend-testing/SKILL.md", '2026-07-07T08:01:00Z'),
        functionOutput('call-a1', 1, '2026-07-07T08:01:01Z'),
        taskStarted('turn-b', '2026-07-07T09:00:01Z'),
        turnContext('turn-b', difyRoot, '2026-07-07T09:00:02Z'),
        functionCall('call-b1', "cat /Users/twwu/.agents/skills/frontend-testing/SKILL.md", '2026-07-07T09:01:00Z'),
        functionOutput('call-b1', 0, '2026-07-07T09:01:01Z'),
      ]));
      const usage = new SkillUsageManager({
        dataDir: path.join(root, 'usage'),
        now: new Date('2026-07-08T12:00:00Z'),
        providers: [
          { provider: 'codex', displayName: 'Codex', supported: true, artifactRoots: [sessionsRoot] },
        ],
      });

      await usage.importProvider('codex');

      const overview = await usage.getOverview({
        rangeDays: 7,
        now: new Date('2026-07-08T12:00:00Z'),
      });
      expect(overview.providers[0].heatmap.find((cell) => cell.date === '2026-07-07')).toMatchObject({
        countedInvocations: 1,
        failedInvocations: 1,
      });
      expect(overview).toMatchObject({
        providers: [{
          ranking: [
            { skillName: 'frontend-testing', countedInvocations: 1, failedInvocations: 1 },
          ],
        }],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns per-day skill usage details and fixed ranking order', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const sessionsRoot = path.join(root, 'codex-sessions');
      const usageRoot = path.join(root, 'usage');
      const projectRoot = path.join(root, 'project');
      await mkdir(sessionsRoot, { recursive: true });
      await writeFile(path.join(sessionsRoot, 'session.jsonl'), jsonl([
        sessionMeta('session-a', projectRoot, '2026-07-07T08:00:00Z'),
        taskStarted('turn-beta-1', '2026-07-07T08:00:01Z'),
        turnContext('turn-beta-1', projectRoot, '2026-07-07T08:00:02Z'),
        functionCall('call-beta-1', 'cat /Users/twwu/.agents/skills/skill-beta/SKILL.md', '2026-07-07T08:01:00Z'),
        functionOutput('call-beta-1', 0, '2026-07-07T08:01:01Z'),
        taskStarted('turn-alpha-success', '2026-07-07T09:00:01Z'),
        turnContext('turn-alpha-success', projectRoot, '2026-07-07T09:00:02Z'),
        functionCall('call-alpha-success', 'cat /Users/twwu/.agents/skills/skill-alpha/SKILL.md', '2026-07-07T09:01:00Z'),
        functionOutput('call-alpha-success', 0, '2026-07-07T09:01:01Z'),
        taskStarted('turn-zeta', '2026-07-07T10:00:01Z'),
        turnContext('turn-zeta', projectRoot, '2026-07-07T10:00:02Z'),
        functionCall('call-zeta', 'cat /Users/twwu/.agents/skills/skill-zeta/SKILL.md', '2026-07-07T10:01:00Z'),
        functionOutput('call-zeta', 0, '2026-07-07T10:01:01Z'),
        taskStarted('turn-alpha-failed', '2026-07-07T11:00:01Z'),
        turnContext('turn-alpha-failed', projectRoot, '2026-07-07T11:00:02Z'),
        functionCall('call-alpha-failed', 'cat /Users/twwu/.agents/skills/skill-alpha/SKILL.md', '2026-07-07T11:01:00Z'),
        functionOutput('call-alpha-failed', 1, '2026-07-07T11:01:01Z'),
        taskStarted('turn-beta-2', '2026-07-07T12:00:01Z'),
        turnContext('turn-beta-2', projectRoot, '2026-07-07T12:00:02Z'),
        functionCall('call-beta-2', 'cat /Users/twwu/.agents/skills/skill-beta/SKILL.md', '2026-07-07T12:01:00Z'),
        functionOutput('call-beta-2', 0, '2026-07-07T12:01:01Z'),
      ]));
      const currentSkills = [{
        provider: 'global',
        name: 'skill-beta',
        path: '/Users/twwu/.agents/skills/skill-beta',
        resolvedPath: '/Users/twwu/.agents/skills/skill-beta',
      }];
      const usage = new SkillUsageManager({
        dataDir: usageRoot,
        now: new Date('2026-07-08T12:00:00Z'),
        providers: [
          { provider: 'codex', displayName: 'Codex', supported: true, artifactRoots: [sessionsRoot] },
        ],
      });

      await usage.importProvider('codex', currentSkills);

      const overview = await usage.getOverview({
        rangeDays: 7,
        now: new Date('2026-07-08T12:00:00Z'),
      });
      const provider = overview.providers[0];

      expect(provider.ranking.map((row) => ({
        skillName: row.skillName,
        sourcePath: row.sourcePath,
        countedInvocations: row.countedInvocations,
        failedInvocations: row.failedInvocations,
      }))).toEqual([
        { skillName: 'skill-beta', sourcePath: '/Users/twwu/.agents/skills/skill-beta/SKILL.md', countedInvocations: 2, failedInvocations: 0 },
        { skillName: 'skill-alpha', sourcePath: '/Users/twwu/.agents/skills/skill-alpha/SKILL.md', countedInvocations: 1, failedInvocations: 1 },
        { skillName: 'skill-zeta', sourcePath: '/Users/twwu/.agents/skills/skill-zeta/SKILL.md', countedInvocations: 1, failedInvocations: 0 },
      ]);
      expect(provider.dailySkillUsage.find((day) => day.date === '2026-07-07')?.rows).toEqual([
        { skillName: 'skill-beta', sourcePath: '/Users/twwu/.agents/skills/skill-beta/SKILL.md', countedInvocations: 2, failedInvocations: 0, lastInvokedAt: '2026-07-07T12:01:00Z' },
        { skillName: 'skill-alpha', sourcePath: '/Users/twwu/.agents/skills/skill-alpha/SKILL.md', countedInvocations: 1, failedInvocations: 1, lastInvokedAt: '2026-07-07T11:01:00Z' },
        { skillName: 'skill-zeta', sourcePath: '/Users/twwu/.agents/skills/skill-zeta/SKILL.md', countedInvocations: 1, failedInvocations: 0, lastInvokedAt: '2026-07-07T10:01:00Z' },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('persists source and ended-at evidence when the invoked skill matches current inventory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const sessionsRoot = path.join(root, 'codex-sessions');
      const usageRoot = path.join(root, 'usage');
      const skillDir = path.join(root, '.agents', 'skills', 'frontend-testing');
      const skillMdPath = path.join(skillDir, 'SKILL.md');
      await mkdir(sessionsRoot, { recursive: true });
      await mkdir(skillDir, { recursive: true });
      await writeFile(skillMdPath, '---\nname: frontend-testing\n---\n');
      await writeFile(path.join(sessionsRoot, 'session.jsonl'), jsonl([
        sessionMeta('session-a', root, '2026-07-07T08:00:00Z'),
        taskStarted('turn-a', '2026-07-07T08:00:01Z'),
        turnContext('turn-a', root, '2026-07-07T08:00:02Z'),
        functionCall('call-a1', `cat ${skillMdPath}`, '2026-07-07T08:01:00Z'),
        functionOutput('call-a1', 0, '2026-07-07T08:01:15Z'),
      ]));
      const currentSkills = [{
        provider: 'global',
        name: 'frontend-testing',
        path: skillDir,
        resolvedPath: skillDir,
        source: { type: 'skillssh' as const, repo: 'owner/repo', skillFolderHash: 'abc123' },
      }];
      const usage = new SkillUsageManager({
        dataDir: usageRoot,
        now: new Date('2026-07-08T12:00:00Z'),
        providers: [
          { provider: 'codex', displayName: 'Codex', supported: true, artifactRoots: [sessionsRoot] },
        ],
      });

      await expect(usage.importProvider('codex', currentSkills)).resolves.toMatchObject({ importedRecords: 1 });

      const stored = JSON.parse(await readFile(path.join(usageRoot, 'invocations', 'codex', '2026-07.jsonl'), 'utf-8'));
      expect(stored).toMatchObject({
        skillName: 'frontend-testing',
        source: { type: 'skillssh', repo: 'owner/repo', skillFolderHash: 'abc123' },
        endedAt: '2026-07-07T08:01:15Z',
      });

      const overview = await usage.getOverview({
        rangeDays: 7,
        now: new Date('2026-07-08T12:00:00Z'),
      });
      expect(overview.providers[0].ranking[0]).toMatchObject({
        skillName: 'frontend-testing',
        sourcePath: skillMdPath,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps same-named skills separate when their source paths differ', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const sessionsRoot = path.join(root, 'codex-sessions');
      const projectA = path.join(root, 'project-a');
      const projectB = path.join(root, 'project-b');
      const skillA = path.join(projectA, '.agents', 'skills', 'shared-name', 'SKILL.md');
      const skillB = path.join(projectB, '.agents', 'skills', 'shared-name', 'SKILL.md');
      await mkdir(sessionsRoot, { recursive: true });
      await writeFile(path.join(sessionsRoot, 'session.jsonl'), jsonl([
        sessionMeta('session-a', root, '2026-07-07T08:00:00Z'),
        taskStarted('turn-a', '2026-07-07T08:00:01Z'),
        turnContext('turn-a', projectA, '2026-07-07T08:00:02Z'),
        functionCall('call-a1', `cat ${skillA}`, '2026-07-07T08:01:00Z'),
        functionOutput('call-a1', 0, '2026-07-07T08:01:01Z'),
        taskStarted('turn-b', '2026-07-07T09:00:01Z'),
        turnContext('turn-b', projectB, '2026-07-07T09:00:02Z'),
        functionCall('call-b1', `cat ${skillB}`, '2026-07-07T09:01:00Z'),
        functionOutput('call-b1', 0, '2026-07-07T09:01:01Z'),
      ]));
      const usage = new SkillUsageManager({
        dataDir: path.join(root, 'usage'),
        now: new Date('2026-07-08T12:00:00Z'),
        providers: [
          { provider: 'codex', displayName: 'Codex', supported: true, artifactRoots: [sessionsRoot] },
        ],
      });

      await usage.importProvider('codex');

      const overview = await usage.getOverview({
        rangeDays: 7,
        now: new Date('2026-07-08T12:00:00Z'),
      });
      expect(overview.providers[0].ranking.map((row) => ({
        skillName: row.skillName,
        sourcePath: row.sourcePath,
        countedInvocations: row.countedInvocations,
      }))).toEqual([
        { skillName: 'shared-name', sourcePath: skillB, countedInvocations: 1 },
        { skillName: 'shared-name', sourcePath: skillA, countedInvocations: 1 },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('deduplicates Codex reads of one Skill Source Identity within a turn', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const sessionsRoot = path.join(root, 'codex-sessions');
      const aliasRoot = path.join(root, '.agents', 'skills');
      const sharedSkillDir = path.join(root, 'shared', 'skills', 'frontend-testing');
      const resolvedSkillPath = path.join(sharedSkillDir, 'SKILL.md');
      const aliasSkillDir = path.join(aliasRoot, 'frontend-testing');
      const aliasSkillPath = path.join(aliasSkillDir, 'SKILL.md');
      await mkdir(sessionsRoot, { recursive: true });
      await mkdir(aliasRoot, { recursive: true });
      await mkdir(sharedSkillDir, { recursive: true });
      await writeFile(resolvedSkillPath, '---\nname: frontend-testing\n---\n');
      await symlink(sharedSkillDir, aliasSkillDir);
      await writeFile(path.join(sessionsRoot, 'session.jsonl'), jsonl([
        sessionMeta('session-a', root, '2026-07-07T08:00:00Z'),
        taskStarted('turn-a', '2026-07-07T08:00:01Z'),
        turnContext('turn-a', root, '2026-07-07T08:00:02Z'),
        functionCall('call-alias', `cat ${aliasSkillPath}`, '2026-07-07T08:01:00Z'),
        functionOutput('call-alias', 0, '2026-07-07T08:01:01Z'),
        functionCall('call-resolved', `cat ${resolvedSkillPath}`, '2026-07-07T08:01:02Z'),
        functionOutput('call-resolved', 0, '2026-07-07T08:01:03Z'),
      ]));
      const usage = new SkillUsageManager({
        dataDir: path.join(root, 'usage'),
        providers: [{
          provider: 'codex',
          displayName: 'Codex',
          supported: true,
          artifactRoots: [sessionsRoot],
        }],
      });

      await expect(usage.importProvider('codex')).resolves.toMatchObject({ importedRecords: 1 });
      const [storedRecord] = (await readFile(
        path.join(root, 'usage', 'invocations', 'codex', '2026-07.jsonl'),
        'utf-8',
      )).trim().split('\n').map((line) => JSON.parse(line) as {
        skillPath?: string;
        resolvedPath?: string;
      });
      expect(storedRecord.skillPath).toBeUndefined();
      expect(storedRecord.resolvedPath).toBe(await realpath(resolvedSkillPath));
      const overview = await usage.getOverview({
        rangeDays: 7,
        now: new Date('2026-07-08T12:00:00Z'),
      });
      expect(overview.providers[0].ranking).toMatchObject([
        {
          skillName: 'frontend-testing',
          sourcePath: await realpath(resolvedSkillPath),
          countedInvocations: 1,
        },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('combines usage aliases by their resolved Skill Source Identity', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const usageRoot = path.join(root, 'usage');
      const partitionRoot = path.join(usageRoot, 'invocations', 'claude');
      const resolvedPath = path.join(root, 'shared-skills', 'frontend-testing', 'SKILL.md');
      await mkdir(partitionRoot, { recursive: true });
      await writeFile(path.join(partitionRoot, '2026-07.jsonl'), jsonl([
        {
          schemaVersion: 1,
          recordId: 'alias-invocation',
          provider: 'claude',
          sessionId: 'session-a',
          turnId: 'message-a',
          skillName: 'frontend-testing',
          skillPath: path.join(root, 'claude-skills', 'frontend-testing', 'SKILL.md'),
          resolvedPath,
          identityConfidence: 'confirmed',
          status: 'used',
          startedAt: '2026-07-07T09:00:00Z',
        },
        {
          schemaVersion: 1,
          recordId: 'resolved-invocation',
          provider: 'claude',
          sessionId: 'session-b',
          turnId: 'message-b',
          skillName: 'frontend-testing',
          resolvedPath,
          identityConfidence: 'confirmed',
          status: 'used',
          startedAt: '2026-07-07T10:00:00Z',
        },
      ]));
      const usage = new SkillUsageManager({
        dataDir: usageRoot,
        providers: [{
          provider: 'claude',
          displayName: 'Claude',
          supported: true,
          artifactRoots: [path.join(root, 'claude-projects')],
          skillRoots: [path.join(root, 'claude-skills')],
        }],
      });

      const overview = await usage.getOverview({
        rangeDays: 7,
        now: new Date('2026-07-08T12:00:00Z'),
      });

      expect(overview.providers[0].ranking).toEqual([{
        skillName: 'frontend-testing',
        sourcePath: resolvedPath,
        countedInvocations: 2,
        failedInvocations: 0,
        lastInvokedAt: '2026-07-07T10:00:00Z',
      }]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('combines plugin skill usage across cached plugin versions', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const sessionsRoot = path.join(root, 'codex-sessions');
      const firstVersion = path.join(root, '.codex', 'plugins', 'cache', 'openai-curated', 'github', 'version-a', 'skills', 'github', 'SKILL.md');
      const secondVersion = path.join(root, '.codex', 'plugins', 'cache', 'openai-curated', 'github', 'version-b', 'skills', 'github', 'SKILL.md');
      await mkdir(sessionsRoot, { recursive: true });
      await mkdir(path.dirname(firstVersion), { recursive: true });
      await mkdir(path.dirname(secondVersion), { recursive: true });
      await writeFile(firstVersion, '---\nname: github\n---\n');
      await writeFile(secondVersion, '---\nname: github\n---\n');
      await writeFile(path.join(sessionsRoot, 'session.jsonl'), jsonl([
        sessionMeta('session-a', root, '2026-07-07T08:00:00Z'),
        taskStarted('turn-a', '2026-07-07T08:00:01Z'),
        turnContext('turn-a', root, '2026-07-07T08:00:02Z'),
        functionCall('call-a', `cat ${firstVersion}`, '2026-07-07T08:01:00Z'),
        functionOutput('call-a', 0, '2026-07-07T08:01:01Z'),
        taskStarted('turn-b', '2026-07-07T09:00:01Z'),
        turnContext('turn-b', root, '2026-07-07T09:00:02Z'),
        functionCall('call-b', `cat ${secondVersion}`, '2026-07-07T09:01:00Z'),
        functionOutput('call-b', 0, '2026-07-07T09:01:01Z'),
      ]));
      const usage = new SkillUsageManager({
        dataDir: path.join(root, 'usage'),
        now: new Date('2026-07-08T12:00:00Z'),
        providers: [
          { provider: 'codex', displayName: 'Codex', supported: true, artifactRoots: [sessionsRoot] },
        ],
      });

      await usage.importProvider('codex');

      const overview = await usage.getOverview({
        rangeDays: 7,
        now: new Date('2026-07-08T12:00:00Z'),
      });
      expect(overview.providers[0].ranking).toEqual([{
        skillName: 'github:github',
        sourcePath: undefined,
        countedInvocations: 2,
        failedInvocations: 0,
        lastInvokedAt: '2026-07-07T09:01:00Z',
      }]);
      expect(overview.providers[0].dailySkillUsage.find((day) => day.date === '2026-07-07')?.rows).toEqual([
        {
          skillName: 'github:github',
          sourcePath: undefined,
          countedInvocations: 2,
          failedInvocations: 0,
          lastInvokedAt: '2026-07-07T09:01:00Z',
        },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('limits Provider Skill Ranking to the top 10 counted skills', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const sessionsRoot = path.join(root, 'codex-sessions');
      const difyRoot = path.join(root, 'dify');
      await mkdir(sessionsRoot, { recursive: true });
      const events: unknown[] = [sessionMeta('session-a', difyRoot, '2026-07-07T08:00:00Z')];
      for (let index = 0; index < 11; index += 1) {
        const skillName = `skill-${String(index).padStart(2, '0')}`;
        events.push(
          taskStarted(`turn-${index}`, `2026-07-07T08:${String(index).padStart(2, '0')}:00Z`),
          turnContext(`turn-${index}`, difyRoot, `2026-07-07T08:${String(index).padStart(2, '0')}:01Z`),
          functionCall(`call-${index}`, `cat /Users/twwu/.agents/skills/${skillName}/SKILL.md`, `2026-07-07T08:${String(index).padStart(2, '0')}:02Z`),
          functionOutput(`call-${index}`, 0, `2026-07-07T08:${String(index).padStart(2, '0')}:03Z`),
        );
      }
      await writeFile(path.join(sessionsRoot, 'session.jsonl'), jsonl(events));
      const usage = new SkillUsageManager({
        dataDir: path.join(root, 'usage'),
        now: new Date('2026-07-08T12:00:00Z'),
        providers: [
          { provider: 'codex', displayName: 'Codex', supported: true, artifactRoots: [sessionsRoot] },
        ],
      });

      await usage.importProvider('codex');

      const overview = await usage.getOverview({
        rangeDays: 7,
        now: new Date('2026-07-08T12:00:00Z'),
      });
      expect(overview.providers[0].ranking.map((row) => row.skillName)).toEqual([
        'skill-10',
        'skill-09',
        'skill-08',
        'skill-07',
        'skill-06',
        'skill-05',
        'skill-04',
        'skill-03',
        'skill-02',
        'skill-01',
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('imports idempotently and invalidates old cursors when the importer version changes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const sessionsRoot = path.join(root, 'codex-sessions');
      const usageRoot = path.join(root, 'usage');
      const difyRoot = path.join(root, 'dify');
      const artifact = path.join(sessionsRoot, 'session.jsonl');
      await mkdir(sessionsRoot, { recursive: true });
      await writeFile(artifact, jsonl([
        sessionMeta('session-a', difyRoot, '2026-07-07T08:00:00Z'),
        taskStarted('turn-a', '2026-07-07T08:00:01Z'),
        turnContext('turn-a', difyRoot, '2026-07-07T08:00:02Z'),
        functionCall('call-a1', "sed -n '1,220p' /Users/twwu/.agents/skills/frontend-testing/SKILL.md", '2026-07-07T08:01:00Z'),
        functionOutput('call-a1', 0, '2026-07-07T08:01:01Z'),
      ]));
      const usage = new SkillUsageManager({
        dataDir: usageRoot,
        now: new Date('2026-07-08T12:00:00Z'),
        providers: [
          { provider: 'codex', displayName: 'Codex', supported: true, artifactRoots: [sessionsRoot] },
        ],
      });

      await expect(usage.importProvider('codex')).resolves.toMatchObject({ importedRecords: 1 });
      await expect(usage.importProvider('codex')).resolves.toMatchObject({ importedRecords: 0 });

      const metadata = await stat(artifact);
      await mkdir(path.join(usageRoot, 'cursors'), { recursive: true });
      await writeFile(path.join(usageRoot, 'cursors', 'codex.json'), JSON.stringify({
        provider: 'codex',
        importerVersion: 2,
        artifacts: {
          [artifact]: { size: metadata.size, mtimeMs: metadata.mtimeMs },
        },
      }) + '\n', 'utf-8');
      await expect(usage.importProvider('codex')).resolves.toMatchObject({ importedRecords: 1 });

      const stored = await readFile(path.join(usageRoot, 'invocations', 'codex', '2026-07.jsonl'), 'utf-8');
      expect(stored.trim().split('\n')).toHaveLength(1);
      await expect(readFile(path.join(usageRoot, 'cursors', 'codex.json'), 'utf-8')).resolves.toContain('"importerVersion": 8');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('imports one Claude Skill tool use from a supported main session transcript', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const artifactRoot = path.join(root, 'claude-projects');
      const projectArtifacts = path.join(artifactRoot, '-tmp-project');
      const skillRoot = path.join(root, 'claude-skills');
      const skillDir = path.join(skillRoot, 'frontend-testing');
      const skillMdPath = path.join(skillDir, 'SKILL.md');
      await mkdir(projectArtifacts, { recursive: true });
      await mkdir(skillDir, { recursive: true });
      await writeFile(skillMdPath, '---\nname: frontend-testing\ndescription: Test frontend behavior\n---\n');
      await writeFile(path.join(projectArtifacts, 'session-a.jsonl'), jsonl([
        claudeAssistant({
          sessionId: 'session-a',
          messageId: 'message-a',
          toolUseId: 'toolu-a',
          skillName: 'frontend-testing',
          timestamp: '2026-07-07T09:00:00Z',
        }),
      ]));

      const usage = new SkillUsageManager({
        dataDir: path.join(root, 'usage'),
        now: new Date('2026-07-08T12:00:00Z'),
        providers: [{
          provider: 'claude',
          displayName: 'Claude',
          supported: true,
          artifactRoots: [artifactRoot],
          skillRoots: [skillRoot],
        }],
      });

      await expect(usage.importProvider('claude')).resolves.toEqual({
        provider: 'claude',
        importedRecords: 1,
        skippedArtifacts: 0,
        diagnostics: [],
      });

      await expect(usage.getOverview({
        rangeDays: 7,
        now: new Date('2026-07-08T12:00:00Z'),
      })).resolves.toMatchObject({
        providers: [{
          provider: 'claude',
          coverageState: 'active',
          ranking: [{
            skillName: 'frontend-testing',
            sourcePath: skillMdPath,
            countedInvocations: 1,
            failedInvocations: 0,
          }],
        }],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('counts each Claude Skill tool use block in one assistant message', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const artifactRoot = path.join(root, 'claude-projects');
      const projectArtifacts = path.join(artifactRoot, '-tmp-project');
      const skillRoot = path.join(root, 'claude-skills');
      const skillDir = path.join(skillRoot, 'frontend-testing');
      await mkdir(projectArtifacts, { recursive: true });
      await mkdir(skillDir, { recursive: true });
      await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: frontend-testing\n---\n');
      const assistant = claudeAssistant({
        sessionId: 'session-a',
        messageId: 'message-a',
        toolUseId: 'toolu-a',
        skillName: 'frontend-testing',
        timestamp: '2026-07-07T09:00:00Z',
      });
      const message = assistant.message as { content: unknown[] };
      message.content.push({
        type: 'tool_use',
        id: 'toolu-b',
        name: 'Skill',
        input: { skill: 'frontend-testing' },
      });
      await writeFile(path.join(projectArtifacts, 'session-a.jsonl'), jsonl([assistant]));
      const usage = new SkillUsageManager({
        dataDir: path.join(root, 'usage'),
        providers: [{
          provider: 'claude',
          displayName: 'Claude',
          supported: true,
          artifactRoots: [artifactRoot],
          skillRoots: [skillRoot],
        }],
      });

      await expect(usage.importProvider('claude')).resolves.toMatchObject({ importedRecords: 2 });
      const overview = await usage.getOverview({
        rangeDays: 7,
        now: new Date('2026-07-08T12:00:00Z'),
      });
      expect(overview.providers[0].ranking[0]).toMatchObject({
        skillName: 'frontend-testing',
        countedInvocations: 2,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('aggregates diagnostics for Claude Skill calls without an eligible source', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const artifactRoot = path.join(root, 'claude-projects');
      const projectArtifacts = path.join(artifactRoot, '-tmp-project');
      const skillRoot = path.join(root, 'claude-skills');
      await mkdir(projectArtifacts, { recursive: true });
      await mkdir(skillRoot, { recursive: true });
      await writeFile(path.join(projectArtifacts, 'session-a.jsonl'), jsonl([
        claudeAssistant({
          sessionId: 'session-a',
          messageId: 'message-a',
          toolUseId: 'toolu-a',
          skillName: 'statusline-setup',
          timestamp: '2026-07-07T09:00:00Z',
        }),
        claudeAssistant({
          sessionId: 'session-a',
          messageId: 'message-b',
          toolUseId: 'toolu-b',
          skillName: 'statusline-setup',
          timestamp: '2026-07-07T09:01:00Z',
        }),
      ]));
      const usage = new SkillUsageManager({
        dataDir: path.join(root, 'usage'),
        providers: [{
          provider: 'claude',
          displayName: 'Claude',
          supported: true,
          artifactRoots: [artifactRoot],
          skillRoots: [skillRoot],
        }],
      });

      await expect(usage.importProvider('claude')).resolves.toEqual({
        provider: 'claude',
        importedRecords: 0,
        skippedArtifacts: 0,
        diagnostics: [{
          provider: 'claude',
          message: 'Skipped 2 Claude Skill invocations for "statusline-setup" in session-a.jsonl: no eligible user-level or plugin source',
        }],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('records a Claude Skill invocation as failed from its structured tool result', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const artifactRoot = path.join(root, 'claude-projects');
      const projectArtifacts = path.join(artifactRoot, '-tmp-project');
      const skillRoot = path.join(root, 'claude-skills');
      const skillDir = path.join(skillRoot, 'frontend-testing');
      await mkdir(projectArtifacts, { recursive: true });
      await mkdir(skillDir, { recursive: true });
      await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: frontend-testing\n---\n');
      await writeFile(path.join(projectArtifacts, 'session-a.jsonl'), jsonl([
        claudeAssistant({
          sessionId: 'session-a',
          messageId: 'message-a',
          toolUseId: 'toolu-a',
          skillName: 'frontend-testing',
          timestamp: '2026-07-07T09:00:00Z',
        }),
        claudeToolResult({
          sessionId: 'session-a',
          messageId: 'message-b',
          toolUseId: 'toolu-a',
          isError: true,
          timestamp: '2026-07-07T09:00:05Z',
        }),
      ]));
      const usage = new SkillUsageManager({
        dataDir: path.join(root, 'usage'),
        providers: [{
          provider: 'claude',
          displayName: 'Claude',
          supported: true,
          artifactRoots: [artifactRoot],
          skillRoots: [skillRoot],
        }],
      });

      await usage.importProvider('claude');

      await expect(usage.getOverview({
        rangeDays: 7,
        now: new Date('2026-07-08T12:00:00Z'),
      })).resolves.toMatchObject({
        providers: [{
          heatmap: expect.arrayContaining([{
            date: '2026-07-07',
            countedInvocations: 0,
            failedInvocations: 1,
          }]),
          ranking: [{
            skillName: 'frontend-testing',
            countedInvocations: 0,
            failedInvocations: 1,
          }],
        }],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('imports only supported Claude transcript path shapes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const artifactRoot = path.join(root, 'claude-projects');
      const projectArtifacts = path.join(artifactRoot, '-tmp-project');
      const unsupportedDir = path.join(projectArtifacts, 'logs');
      const skillRoot = path.join(root, 'claude-skills');
      const skillDir = path.join(skillRoot, 'frontend-testing');
      await mkdir(unsupportedDir, { recursive: true });
      await mkdir(skillDir, { recursive: true });
      await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: frontend-testing\n---\n');
      await writeFile(path.join(projectArtifacts, 'session-a.jsonl'), jsonl([
        claudeAssistant({
          sessionId: 'session-a',
          messageId: 'message-a',
          toolUseId: 'toolu-a',
          skillName: 'frontend-testing',
          timestamp: '2026-07-07T09:00:00Z',
        }),
      ]));
      await writeFile(path.join(unsupportedDir, 'trace.jsonl'), jsonl([
        claudeAssistant({
          sessionId: 'session-a',
          messageId: 'message-b',
          toolUseId: 'toolu-b',
          skillName: 'frontend-testing',
          timestamp: '2026-07-07T09:01:00Z',
        }),
      ]));
      const usage = new SkillUsageManager({
        dataDir: path.join(root, 'usage'),
        providers: [{
          provider: 'claude',
          displayName: 'Claude',
          supported: true,
          artifactRoots: [artifactRoot],
          skillRoots: [skillRoot],
        }],
      });

      await expect(usage.importProvider('claude')).resolves.toEqual({
        provider: 'claude',
        importedRecords: 1,
        skippedArtifacts: 1,
        diagnostics: [{
          provider: 'claude',
          message: `Skipped unsupported Claude artifact path: ${path.join('-tmp-project', 'logs', 'trace.jsonl')}`,
        }],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('continues importing Claude transcripts with malformed JSONL lines', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const artifactRoot = path.join(root, 'claude-projects');
      const projectArtifacts = path.join(artifactRoot, '-tmp-project');
      const skillRoot = path.join(root, 'claude-skills');
      const skillDir = path.join(skillRoot, 'frontend-testing');
      await mkdir(projectArtifacts, { recursive: true });
      await mkdir(skillDir, { recursive: true });
      await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: frontend-testing\n---\n');
      await writeFile(
        path.join(projectArtifacts, 'session-a.jsonl'),
        `${JSON.stringify(claudeAssistant({
          sessionId: 'session-a',
          messageId: 'message-a',
          toolUseId: 'toolu-a',
          skillName: 'frontend-testing',
          timestamp: '2026-07-07T09:00:00Z',
        }))}\n{not-json\n[also-not-json\n`,
      );
      const usage = new SkillUsageManager({
        dataDir: path.join(root, 'usage'),
        providers: [{
          provider: 'claude',
          displayName: 'Claude',
          supported: true,
          artifactRoots: [artifactRoot],
          skillRoots: [skillRoot],
        }],
      });

      await expect(usage.importProvider('claude')).resolves.toEqual({
        provider: 'claude',
        importedRecords: 1,
        skippedArtifacts: 0,
        diagnostics: [{
          provider: 'claude',
          message: 'Skipped 2 malformed JSONL lines in session-a.jsonl',
        }],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('follows symlinked Claude subagent transcripts and imports each real artifact once', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const artifactRoot = path.join(root, 'claude-projects');
      const firstSubagents = path.join(artifactRoot, '-tmp-project', 'session-a', 'subagents');
      const secondSubagents = path.join(artifactRoot, '-tmp-project', 'session-b', 'subagents');
      const sharedArtifact = path.join(root, 'shared-agent.jsonl');
      const skillRoot = path.join(root, 'claude-skills');
      const skillDir = path.join(skillRoot, 'frontend-testing');
      await mkdir(firstSubagents, { recursive: true });
      await mkdir(secondSubagents, { recursive: true });
      await mkdir(skillDir, { recursive: true });
      await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: frontend-testing\n---\n');
      await writeFile(sharedArtifact, jsonl([
        claudeAssistant({
          sessionId: 'session-a',
          messageId: 'message-a',
          toolUseId: 'toolu-a',
          skillName: 'frontend-testing',
          timestamp: '2026-07-07T09:00:00Z',
        }),
      ]));
      await symlink(sharedArtifact, path.join(firstSubagents, 'agent-shared.jsonl'));
      await symlink(sharedArtifact, path.join(secondSubagents, 'agent-shared.jsonl'));
      const usage = new SkillUsageManager({
        dataDir: path.join(root, 'usage'),
        providers: [{
          provider: 'claude',
          displayName: 'Claude',
          supported: true,
          artifactRoots: [artifactRoot],
          skillRoots: [skillRoot],
        }],
      });

      await expect(usage.importProvider('claude')).resolves.toMatchObject({
        importedRecords: 1,
        skippedArtifacts: 0,
        diagnostics: [],
      });
      const overview = await usage.getOverview({
        rangeDays: 7,
        now: new Date('2026-07-08T12:00:00Z'),
      });
      expect(overview.providers[0].ranking[0]).toMatchObject({
        skillName: 'frontend-testing',
        countedInvocations: 1,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('collapses Claude skill aliases that resolve to the same source', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const artifactRoot = path.join(root, 'claude-projects');
      const projectArtifacts = path.join(artifactRoot, '-tmp-project');
      const skillRoot = path.join(root, 'claude-skills');
      const sharedSkillDir = path.join(root, 'shared-skills', 'frontend-testing');
      const resolvedSkillMdPath = path.join(sharedSkillDir, 'SKILL.md');
      await mkdir(projectArtifacts, { recursive: true });
      await mkdir(skillRoot, { recursive: true });
      await mkdir(sharedSkillDir, { recursive: true });
      await writeFile(resolvedSkillMdPath, '---\nname: frontend-testing\n---\n');
      await symlink(sharedSkillDir, path.join(skillRoot, 'frontend-testing-a'));
      await symlink(sharedSkillDir, path.join(skillRoot, 'frontend-testing-b'));
      const expectedResolvedSkillMdPath = await realpath(resolvedSkillMdPath);
      await writeFile(path.join(projectArtifacts, 'session-a.jsonl'), jsonl([
        claudeAssistant({
          sessionId: 'session-a',
          messageId: 'message-a',
          toolUseId: 'toolu-a',
          skillName: 'frontend-testing',
          timestamp: '2026-07-07T09:00:00Z',
        }),
      ]));
      const usage = new SkillUsageManager({
        dataDir: path.join(root, 'usage'),
        providers: [{
          provider: 'claude',
          displayName: 'Claude',
          supported: true,
          artifactRoots: [artifactRoot],
          skillRoots: [skillRoot],
        }],
      });

      await expect(usage.importProvider('claude')).resolves.toMatchObject({ importedRecords: 1 });
      const overview = await usage.getOverview({
        rangeDays: 7,
        now: new Date('2026-07-08T12:00:00Z'),
      });
      expect(overview.providers[0].ranking[0]).toMatchObject({
        skillName: 'frontend-testing',
        sourcePath: expectedResolvedSkillMdPath,
        countedInvocations: 1,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('counts a Claude invocation without a source path when distinct sources share its name', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const artifactRoot = path.join(root, 'claude-projects');
      const projectArtifacts = path.join(artifactRoot, '-tmp-project');
      const firstSkillRoot = path.join(root, 'claude-skills-a');
      const secondSkillRoot = path.join(root, 'claude-skills-b');
      await mkdir(projectArtifacts, { recursive: true });
      for (const skillRoot of [firstSkillRoot, secondSkillRoot]) {
        const skillDir = path.join(skillRoot, 'frontend-testing');
        await mkdir(skillDir, { recursive: true });
        await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: frontend-testing\n---\n');
      }
      await writeFile(path.join(projectArtifacts, 'session-a.jsonl'), jsonl([
        claudeAssistant({
          sessionId: 'session-a',
          messageId: 'message-a',
          toolUseId: 'toolu-a',
          skillName: 'frontend-testing',
          timestamp: '2026-07-07T09:00:00Z',
        }),
      ]));
      const usage = new SkillUsageManager({
        dataDir: path.join(root, 'usage'),
        providers: [{
          provider: 'claude',
          displayName: 'Claude',
          supported: true,
          artifactRoots: [artifactRoot],
          skillRoots: [firstSkillRoot, secondSkillRoot],
        }],
      });

      await expect(usage.importProvider('claude')).resolves.toMatchObject({ importedRecords: 1 });
      const overview = await usage.getOverview({
        rangeDays: 7,
        now: new Date('2026-07-08T12:00:00Z'),
      });
      expect(overview.providers[0].ranking[0]).toMatchObject({
        skillName: 'frontend-testing',
        sourcePath: undefined,
        countedInvocations: 1,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('revises a Claude invocation when a failed tool result arrives later', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const artifactRoot = path.join(root, 'claude-projects');
      const projectArtifacts = path.join(artifactRoot, '-tmp-project');
      const artifact = path.join(projectArtifacts, 'session-a.jsonl');
      const skillRoot = path.join(root, 'claude-skills');
      const skillDir = path.join(skillRoot, 'frontend-testing');
      await mkdir(projectArtifacts, { recursive: true });
      await mkdir(skillDir, { recursive: true });
      await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: frontend-testing\n---\n');
      await writeFile(artifact, jsonl([
        claudeAssistant({
          sessionId: 'session-a',
          messageId: 'message-a',
          toolUseId: 'toolu-a',
          skillName: 'frontend-testing',
          timestamp: '2026-07-07T09:00:00Z',
        }),
      ]));
      const usage = new SkillUsageManager({
        dataDir: path.join(root, 'usage'),
        providers: [{
          provider: 'claude',
          displayName: 'Claude',
          supported: true,
          artifactRoots: [artifactRoot],
          skillRoots: [skillRoot],
        }],
      });

      await expect(usage.importProvider('claude')).resolves.toMatchObject({ importedRecords: 1 });
      await appendFile(artifact, jsonl([
        claudeToolResult({
          sessionId: 'session-a',
          messageId: 'message-b',
          toolUseId: 'toolu-a',
          isError: true,
          timestamp: '2026-07-07T09:00:05Z',
        }),
      ]));

      await expect(usage.importProvider('claude')).resolves.toMatchObject({ importedRecords: 1 });
      const revisions = (await readFile(
        path.join(root, 'usage', 'invocations', 'claude', '2026-07.jsonl'),
        'utf-8',
      )).trim().split('\n').map((line) => JSON.parse(line) as {
        recordId: string;
        provider: string;
        startedAt: string;
      });
      expect(revisions).toHaveLength(2);
      expect(new Set(revisions.map((record) => record.recordId))).toHaveLength(1);
      expect(new Set(revisions.map((record) => record.provider))).toEqual(new Set(['claude']));
      expect(new Set(revisions.map((record) => record.startedAt.slice(0, 7)))).toEqual(new Set(['2026-07']));
      const overview = await usage.getOverview({
        rangeDays: 7,
        now: new Date('2026-07-08T12:00:00Z'),
      });
      expect(overview.providers[0].heatmap.find((cell) => cell.date === '2026-07-07')).toMatchObject({
        countedInvocations: 0,
        failedInvocations: 1,
      });
      expect(overview.providers[0].ranking[0]).toMatchObject({
        skillName: 'frontend-testing',
        countedInvocations: 0,
        failedInvocations: 1,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('skips Claude Skill calls with missing or invalid assistant timestamps', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const artifactRoot = path.join(root, 'claude-projects');
      const projectArtifacts = path.join(artifactRoot, '-tmp-project');
      const skillRoot = path.join(root, 'claude-skills');
      const skillDir = path.join(skillRoot, 'frontend-testing');
      await mkdir(projectArtifacts, { recursive: true });
      await mkdir(skillDir, { recursive: true });
      await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: frontend-testing\n---\n');
      const untimedAssistant = claudeAssistant({
        sessionId: 'session-a',
        messageId: 'message-a',
        toolUseId: 'toolu-a',
        skillName: 'frontend-testing',
        timestamp: '2026-07-07T09:00:00Z',
      });
      delete untimedAssistant.timestamp;
      const untimedContent = (untimedAssistant.message as { content: unknown[] }).content;
      untimedContent.push(
        { type: 'tool_use', id: 'toolu-empty', name: 'Skill', input: { skill: '   ' } },
        { type: 'tool_use', id: 'toolu-invalid', name: 'Skill', input: 'frontend-testing' },
      );
      const invalidTimestampAssistant = claudeAssistant({
        sessionId: 'session-a',
        messageId: 'message-b',
        toolUseId: 'toolu-b',
        skillName: 'frontend-testing',
        timestamp: 'not-a-timestamp',
      });
      await writeFile(path.join(projectArtifacts, 'session-a.jsonl'), jsonl([
        untimedAssistant,
        invalidTimestampAssistant,
      ]));
      const usage = new SkillUsageManager({
        dataDir: path.join(root, 'usage'),
        providers: [{
          provider: 'claude',
          displayName: 'Claude',
          supported: true,
          artifactRoots: [artifactRoot],
          skillRoots: [skillRoot],
        }],
      });

      await expect(usage.importProvider('claude')).resolves.toEqual({
        provider: 'claude',
        importedRecords: 0,
        skippedArtifacts: 0,
        diagnostics: [{
          provider: 'claude',
          message: 'Skipped 2 Claude Skill invocations in session-a.jsonl: missing or invalid assistant timestamp',
        }],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('skips Claude usage imports while the provider is unsupported', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'skillpack-usage-'));
    try {
      const sessionsRoot = path.join(root, 'codex-sessions');
      const claudeRoot = path.join(root, 'claude-projects');
      const difyRoot = path.join(root, 'dify');
      await mkdir(sessionsRoot, { recursive: true });
      await mkdir(claudeRoot, { recursive: true });
      await writeFile(path.join(sessionsRoot, 'session.jsonl'), jsonl([
        sessionMeta('session-a', difyRoot, '2026-07-07T08:00:00Z'),
        taskStarted('turn-a', '2026-07-07T08:00:01Z'),
        turnContext('turn-a', difyRoot, '2026-07-07T08:00:02Z'),
        functionCall('call-a1', "sed -n '1,220p' /Users/twwu/.agents/skills/frontend-testing/SKILL.md", '2026-07-07T08:01:00Z'),
        functionOutput('call-a1', 0, '2026-07-07T08:01:01Z'),
      ]));
      await writeFile(path.join(claudeRoot, 'session.jsonl'), jsonl([
        {
          type: 'skill_invocation',
          session_id: 'claude-session',
          timestamp: '2026-07-07T09:00:00Z',
          status: 'used',
          skill: { name: 'frontend-testing' },
        },
      ]));
      const usage = new SkillUsageManager({
        dataDir: path.join(root, 'usage'),
        now: new Date('2026-07-08T12:00:00Z'),
        providers: [
          { provider: 'codex', displayName: 'Codex', supported: true, artifactRoots: [sessionsRoot] },
          { provider: 'claude', displayName: 'Claude', supported: false, artifactRoots: [claudeRoot] },
        ],
      });

      await expect(usage.importAllProviders()).resolves.toEqual([{
        provider: 'codex',
        importedRecords: 1,
        skippedArtifacts: 0,
        diagnostics: [],
      }]);
      await expect(usage.getOverview({
        rangeDays: 7,
        now: new Date('2026-07-08T12:00:00Z'),
      })).resolves.toMatchObject({
        providers: [
          { provider: 'codex', ranking: [{ skillName: 'frontend-testing', countedInvocations: 1 }] },
          { provider: 'claude', coverageState: 'unsupported', ranking: [] },
        ],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function jsonl(events: unknown[]): string {
  return events.map((event) => JSON.stringify(event)).join('\n') + '\n';
}

function sessionMeta(sessionId: string, cwd: string, timestamp: string): Record<string, unknown> {
  return {
    timestamp,
    type: 'session_meta',
    payload: { session_id: sessionId, cwd },
  };
}

function taskStarted(turnId: string, timestamp: string): Record<string, unknown> {
  return {
    timestamp,
    type: 'event_msg',
    payload: { type: 'task_started', turn_id: turnId },
  };
}

function turnContext(turnId: string, cwd: string, timestamp: string): Record<string, unknown> {
  return {
    timestamp,
    type: 'turn_context',
    payload: { turn_id: turnId, cwd },
  };
}

function functionCall(callId: string, cmd: string, timestamp: string): Record<string, unknown> {
  return {
    timestamp,
    type: 'response_item',
    payload: {
      type: 'function_call',
      name: 'exec_command',
      call_id: callId,
      arguments: JSON.stringify({ cmd }),
    },
  };
}

function functionOutput(callId: string, exitCode: number, timestamp: string): Record<string, unknown> {
  return {
    timestamp,
    type: 'response_item',
    payload: {
      type: 'function_call_output',
      call_id: callId,
      output: `Chunk ID: abc\nProcess exited with code ${exitCode}\nOutput:\n`,
    },
  };
}

function customToolCall(callId: string, cmd: string, timestamp: string): Record<string, unknown> {
  return {
    timestamp,
    type: 'response_item',
    payload: {
      type: 'custom_tool_call',
      name: 'exec_command',
      call_id: callId,
      input: JSON.stringify({ cmd }),
    },
  };
}

function claudeAssistant(input: {
  sessionId: string;
  messageId: string;
  toolUseId: string;
  skillName: string;
  timestamp: string;
}): Record<string, unknown> {
  return {
    type: 'assistant',
    uuid: input.messageId,
    sessionId: input.sessionId,
    timestamp: input.timestamp,
    message: {
      role: 'assistant',
      content: [{
        type: 'tool_use',
        id: input.toolUseId,
        name: 'Skill',
        input: { skill: input.skillName },
      }],
    },
  };
}

function claudeToolResult(input: {
  sessionId: string;
  messageId: string;
  toolUseId: string;
  isError: boolean;
  timestamp: string;
}): Record<string, unknown> {
  return {
    type: 'user',
    uuid: input.messageId,
    sessionId: input.sessionId,
    timestamp: input.timestamp,
    message: {
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: input.toolUseId,
        is_error: input.isError,
        content: 'Launching skill: frontend-testing',
      }],
    },
  };
}
