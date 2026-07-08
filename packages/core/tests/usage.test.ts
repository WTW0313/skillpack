import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
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
          heatmap: [],
          ranking: [],
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
        { skillName: 'frontend-testing', countedInvocations: 1 },
        { skillName: 'github:github', countedInvocations: 1 },
        { skillName: 'openai-docs', countedInvocations: 1 },
        { skillName: 'other-project-only', countedInvocations: 1 },
        { skillName: 'vercel-react-best-practices', countedInvocations: 1 },
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
        currentSkills,
      });
      expect(overview.providers[0].ranking[0]).toMatchObject({
        skillName: 'frontend-testing',
        historical: false,
      });
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
        'skill-00',
        'skill-01',
        'skill-02',
        'skill-03',
        'skill-04',
        'skill-05',
        'skill-06',
        'skill-07',
        'skill-08',
        'skill-09',
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
      await expect(readFile(path.join(usageRoot, 'cursors', 'codex.json'), 'utf-8')).resolves.toContain('"importerVersion": 5');
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
