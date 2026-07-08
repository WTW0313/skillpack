import { afterEach, describe, expect, it } from 'vitest';
import { inventoryGroup, inventoryInstance, testConfig } from '../fixtures/inventory.js';
import { createMockManager } from '../helpers/mock-manager.js';
import { keypress, renderTui, waitForFrame, type RenderTuiResult } from '../helpers/render-tui.js';

let tui: RenderTuiResult | null = null;

function renderApp(...args: Parameters<typeof renderTui>): RenderTuiResult {
  tui = renderTui(...args);
  return tui;
}

function selectedInventoryLine(frame: string): string | undefined {
  return frame.split('\n').find((line) => line.trimStart().startsWith('>'));
}

afterEach(() => {
  tui?.dispose();
  tui = null;
});

describe.sequential('Terminal UI Tests', () => {
  it('renders a stable inventory frame', async () => {
    const app = renderApp();

    const frame = await waitForFrame(app, (output) => (
      output.includes('* Skillpack') && !output.includes('Scanning skills')
    ));

    expect(frame).toMatchSnapshot();
  });

  it('moves the inventory selection with arrow keys', async () => {
    const app = renderApp();
    await waitForFrame(app, (output) => output.includes('* Skillpack') && !output.includes('Scanning skills'));

    expect(selectedInventoryLine(app.normalizedFrame())).toContain('alpha');

    app.stdin.write(keypress.down);
    await waitForFrame(app, (output) => selectedInventoryLine(output)?.includes('bravo') ?? false);

    app.stdin.write(keypress.up);
    await waitForFrame(app, (output) => selectedInventoryLine(output)?.includes('alpha') ?? false);
  });

  it('routes from inventory to detail and back', async () => {
    const app = renderApp();
    await waitForFrame(app, (output) => output.includes('* Skillpack') && !output.includes('Scanning skills'));

    app.stdin.write(keypress.enter);
    await waitForFrame(app, (output) => output.includes('alpha') && output.includes('identity'));

    app.stdin.write(keypress.escape);
    await waitForFrame(app, (output) => output.includes('* Skillpack') && output.includes('alpha'));
  });

  it('filters inventory through search input', async () => {
    const app = renderApp();
    await waitForFrame(app, (output) => output.includes('* Skillpack') && !output.includes('Scanning skills'));

    app.stdin.write('/');
    await waitForFrame(app, (output) => output.includes('filter skills'));

    for (const char of 'charlie') {
      app.stdin.write(char);
    }
    await waitForFrame(app, (output) => output.includes('charlie'));
    app.stdin.write(keypress.enter);

    const frame = await waitForFrame(app, (output) => (
      output.includes('filtered by') && output.includes('charlie')
    ));
    expect(frame).toContain('1 instance');
    expect(frame).toContain('charlie');
    expect(frame).not.toContain('alpha');
  });

  it('opens and closes the help overlay', async () => {
    const app = renderApp();
    await waitForFrame(app, (output) => output.includes('* Skillpack') && !output.includes('Scanning skills'));

    app.stdin.write('?');
    await waitForFrame(app, (output) => output.includes('Inventory Help') && output.includes('search'));

    app.stdin.write('?');
    await waitForFrame(app, (output) => output.includes('* Skillpack') && !output.includes('Inventory Help'));
  });

  it('renders a stable too-small terminal frame', async () => {
    const app = renderApp({ terminalSize: { columns: 59, rows: 18 } });

    const frame = await waitForFrame(app, (output) => output.includes('Terminal too small'));

    expect(frame).toMatchSnapshot();
  });

  it('keeps the too-small terminal state interactive until the user quits', async () => {
    const app = renderApp({ terminalSize: { columns: 59, rows: 18 } });
    await waitForFrame(app, (output) => output.includes('Terminal too small'));

    app.stdin.write('q');

    await waitForFrame(app, (output) => output === '');
  });

  it('calls the toggle mutation from detail without running a real provider mutation', async () => {
    const manager = createMockManager();
    const app = renderApp({ manager });
    await waitForFrame(app, (output) => output.includes('* Skillpack') && !output.includes('Scanning skills'));

    app.stdin.write(keypress.enter);
    await waitForFrame(app, (output) => output.includes('alpha') && output.includes('identity'));

    app.stdin.write(' ');
    await waitForFrame(app, (output) => output.includes('Availability updated.'));

    expect(manager.toggleInventoryInstance).toHaveBeenCalledTimes(1);
  });

  it('opens remove confirmation for skills.sh global skills', async () => {
    const inventory = [
      inventoryGroup('charlie', [
        inventoryInstance({
          name: 'charlie',
          provider: 'global',
          source: { type: 'skillssh', repo: 'owner/charlie' },
          actions: ['update', 'remove'],
        }),
      ]),
    ];
    const app = renderApp({ inventory });
    await waitForFrame(app, (output) => output.includes('* Skillpack') && !output.includes('Scanning skills'));

    app.stdin.write(keypress.enter);
    await waitForFrame(app, (output) => output.includes('charlie') && output.includes('source'));

    app.stdin.write('d');
    await waitForFrame(app, (output) => output.includes('Delete "charlie"?'));
  });

  it('checks update availability for skills.sh global skills', async () => {
    const inventory = [
      inventoryGroup('charlie', [
        inventoryInstance({
          name: 'charlie',
          provider: 'global',
          version: '1.0.0',
          source: { type: 'skillssh', repo: 'owner/charlie' },
          actions: ['update', 'remove'],
        }),
      ]),
    ];
    const manager = createMockManager({
      inventory,
      updateInfo: {
        hasUpdate: true,
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
      },
    });
    const app = renderApp({ manager });
    await waitForFrame(app, (output) => output.includes('* Skillpack') && !output.includes('Scanning skills'));

    app.stdin.write(keypress.enter);
    await waitForFrame(app, (output) => output.includes('charlie') && output.includes('press') && output.includes('to check'));

    app.stdin.write('u');
    await waitForFrame(app, (output) => output.includes('1.0.0') && output.includes('1.1.0'));

    expect(manager.checkSkillUpdate).toHaveBeenCalledTimes(1);
  });

  it('opens the install flow from inventory', async () => {
    const app = renderApp();
    await waitForFrame(app, (output) => output.includes('* Skillpack') && !output.includes('Scanning skills'));

    app.stdin.write('i');
    await waitForFrame(app, (output) => output.includes('Install Skill') && output.includes('Search skills.sh'));
  });

  it('shows Usage Artifact Roots in Settings', async () => {
    const app = renderApp({
      config: testConfig({
        usage: {
          artifactRoots: {
            codex: ['/tmp/codex-usage'],
            claude: ['/tmp/claude-usage'],
          },
        },
      }),
    });
    await waitForFrame(app, (output) => output.includes('* Skillpack') && !output.includes('Scanning skills'));

    app.stdin.write('s');

    await waitForFrame(app, (output) => (
      output.includes('Usage Artifact Roots')
      && output.includes('codex')
      && output.includes('/tmp/codex-usage')
    ));
  });

  it('opens the Usage view from inventory', async () => {
    const app = renderApp();
    await waitForFrame(app, (output) => output.includes('* Skillpack') && !output.includes('Scanning skills'));

    app.stdin.write('g');

    await waitForFrame(app, (output) => (
      output.includes('Skill Usage') && output.includes('Enable usage import?')
    ));

    app.stdin.write(keypress.escape);
    await waitForFrame(app, (output) => output.includes('* Skillpack') && output.includes('alpha'));
  });

  it('persists Usage Import Consent from the Usage view', async () => {
    let persistedConsent: boolean | null = null;
    const app = renderApp({
      onUsageImportConsentChange: async (importConsent) => {
        persistedConsent = importConsent;
        return testConfig({ usage: { importConsent } });
      },
    });
    await waitForFrame(app, (output) => output.includes('* Skillpack') && !output.includes('Scanning skills'));

    app.stdin.write('g');
    await waitForFrame(app, (output) => output.includes('Enable usage import?'));

    app.stdin.write('y');

    await waitForFrame(app, (output) => output.includes('Providers') && output.includes('[Codex unsupported]'));
    expect(persistedConsent).toBe(true);
  });

  it('shows Usage Coverage State from aggregate results', async () => {
    const manager = createMockManager({
      usageOverview: {
        range: { days: 30, from: '2026-06-08', to: '2026-07-07' },
        providers: [
          {
            provider: 'codex',
            displayName: 'Codex',
            coverageState: 'zero',
            heatmap: [],
            dailySkillUsage: [],
            ranking: [],
            diagnostics: [],
          },
          {
            provider: 'claude',
            displayName: 'Claude',
            coverageState: 'unsupported',
            heatmap: [],
            dailySkillUsage: [],
            ranking: [],
            diagnostics: [],
          },
        ],
      },
    });
    const app = renderApp({
      manager,
      config: testConfig({ usage: { importConsent: true } }),
      terminalSize: { columns: 120, rows: 40 },
    });
    await waitForFrame(app, (output) => output.includes('* Skillpack') && !output.includes('Scanning skills'));

    app.stdin.write('g');

    await waitForFrame(app, (output) => output.includes('[Codex zero]') && output.includes('Claude unsupported'));
    expect(manager.importSkillUsage).toHaveBeenCalledTimes(1);
    expect(manager.getSkillUsageOverview).toHaveBeenCalledWith({ rangeDays: 7 });
  });

  it('renders the redesigned Skill Usage layout and keyboard model', async () => {
    const manager = createMockManager();
    manager.getSkillUsageOverview.mockImplementation(async ({ rangeDays }) => ({
      range: { days: rangeDays, from: rangeDays === 30 ? '2026-06-09' : '2026-07-02', to: '2026-07-08' },
      providers: [
        {
          provider: 'codex',
          displayName: 'Codex',
          coverageState: 'active',
          heatmap: [
            { date: '2026-07-02', countedInvocations: 0, failedInvocations: 0 },
            { date: '2026-07-03', countedInvocations: 1, failedInvocations: 0 },
            { date: '2026-07-04', countedInvocations: 0, failedInvocations: 0 },
            { date: '2026-07-05', countedInvocations: 4, failedInvocations: 0 },
            { date: '2026-07-06', countedInvocations: 2, failedInvocations: 0 },
            { date: '2026-07-07', countedInvocations: 1, failedInvocations: 0 },
            { date: '2026-07-08', countedInvocations: 3, failedInvocations: 1 },
          ],
          dailySkillUsage: [
            {
              date: '2026-07-07',
              rows: [
                { skillName: 'openai-docs', countedInvocations: 1, failedInvocations: 0, lastInvokedAt: '2026-07-07T08:00:00Z', historical: false },
              ],
            },
            {
              date: '2026-07-08',
              rows: [
                { skillName: 'frontend-testing', countedInvocations: 2, failedInvocations: 1, lastInvokedAt: '2026-07-08T11:00:00Z', historical: false },
                { skillName: 'github:github', countedInvocations: 1, failedInvocations: 0, lastInvokedAt: '2026-07-08T10:00:00Z', historical: false },
              ],
            },
          ],
          ranking: [
            { skillName: 'frontend-testing', countedInvocations: 5, failedInvocations: 1, lastInvokedAt: '2026-07-08T11:00:00Z', historical: false },
            { skillName: 'github:github', countedInvocations: 2, failedInvocations: 0, lastInvokedAt: '2026-07-08T10:00:00Z', historical: false },
          ],
          diagnostics: [],
        },
        {
          provider: 'claude',
          displayName: 'Claude',
          coverageState: 'unsupported',
          heatmap: [],
          dailySkillUsage: [],
          ranking: [],
          diagnostics: [],
        },
      ],
    }));
    const app = renderApp({
      manager,
      config: testConfig({ usage: { importConsent: true } }),
      terminalSize: { columns: 120, rows: 40 },
    });
    await waitForFrame(app, (output) => output.includes('* Skillpack') && !output.includes('Scanning skills'));

    app.stdin.write('g');

    await waitForFrame(app, (output) => (
      output.includes('Providers')
      && output.includes('[Codex]')
      && output.includes('Claude unsupported')
      && output.includes('Range')
      && output.includes('[7d]')
      && output.includes('Usage heatmap')
      && output.includes('Jul')
      && output.includes('[■]')
      && !output.includes('[3]')
      && output.includes('2026-07-08 · Codex')
      && output.includes('Counted 3 · Failed 1')
      && output.includes('Selected day')
      && output.includes('frontend-testing')
      && output.includes('github:github')
      && output.includes('Provider Skill Ranking')
      && output.includes('Last Used')
    ));

    app.stdin.write(keypress.up);
    await waitForFrame(app, (output) => output.includes('2026-07-07 · Codex') && output.includes('openai-docs'));

    app.stdin.write(keypress.down);
    await waitForFrame(app, (output) => output.includes('2026-07-08 · Codex') && output.includes('frontend-testing'));

    app.stdin.write(keypress.left);
    await waitForFrame(app, (output) => output.includes('2026-07-02 · Codex') && output.includes('No skill usage on this day.'));

    app.stdin.write(keypress.right);
    await waitForFrame(app, (output) => output.includes('2026-07-08 · Codex') && output.includes('frontend-testing'));

    app.stdin.write('2');
    await waitForFrame(app, (output) => output.includes('[30d]'));
    expect(manager.getSkillUsageOverview).toHaveBeenLastCalledWith({ rangeDays: 30 });

    app.stdin.write(keypress.tab);
    await waitForFrame(app, (output) => (
      output.includes('[Claude unsupported]')
      && output.includes('Usage import is not supported for Claude yet.')
      && output.includes('No usage records for this provider and range.')
    ));
  });

  it('shows Skill Usage heatmap counts and Provider Skill Ranking', async () => {
    const manager = createMockManager({
      usageOverview: {
        range: { days: 30, from: '2026-06-08', to: '2026-07-07' },
        providers: [{
          provider: 'codex',
          displayName: 'Codex',
          coverageState: 'active',
          heatmap: [
            { date: '2026-07-06', countedInvocations: 2, failedInvocations: 0 },
            { date: '2026-07-07', countedInvocations: 1, failedInvocations: 0 },
          ],
          dailySkillUsage: [
            {
              date: '2026-07-06',
              rows: [
                { skillName: 'tdd', countedInvocations: 2, failedInvocations: 0, lastInvokedAt: '2026-07-06T10:02:00Z', historical: false },
              ],
            },
            {
              date: '2026-07-07',
              rows: [
                { skillName: 'grilling', countedInvocations: 1, failedInvocations: 0, lastInvokedAt: '2026-07-07T08:00:00Z', historical: false },
              ],
            },
          ],
          ranking: [
            { skillName: 'tdd', countedInvocations: 2, failedInvocations: 0, lastInvokedAt: '2026-07-06T10:02:00Z', historical: false },
            { skillName: 'grilling', countedInvocations: 1, failedInvocations: 0, lastInvokedAt: '2026-07-07T08:00:00Z', historical: false },
          ],
          diagnostics: [],
        }],
      },
    });
    const app = renderApp({
      manager,
      config: testConfig({ usage: { importConsent: true } }),
      terminalSize: { columns: 120, rows: 40 },
    });
    await waitForFrame(app, (output) => output.includes('* Skillpack') && !output.includes('Scanning skills'));

    app.stdin.write('g');

    await waitForFrame(app, (output) => (
      output.includes('Usage heatmap')
      && output.includes('2026-07-07 · Codex')
      && output.includes('Counted 1 · Failed 0')
      && output.includes('Provider Skill Ranking')
      && output.includes('Last Used')
      && output.includes('tdd')
      && output.includes('grilling')
    ));

    app.stdin.write(keypress.up);
    await waitForFrame(app, (output) => output.includes('2026-07-06 · Codex') && output.includes('Counted 2 · Failed 0'));
  });

  it('shows failure context, Historical Skills, and Usage Import Diagnostics', async () => {
    const manager = createMockManager({
      usageOverview: {
        range: { days: 7, from: '2026-06-30', to: '2026-07-06' },
        providers: [{
          provider: 'codex',
          displayName: 'Codex',
          coverageState: 'active',
          heatmap: [
            { date: '2026-07-06', countedInvocations: 1, failedInvocations: 1 },
          ],
          dailySkillUsage: [
            {
              date: '2026-07-06',
              rows: [
                { skillName: 'deleted-skill', countedInvocations: 1, failedInvocations: 1, lastInvokedAt: '2026-07-06T10:02:00Z', historical: true },
              ],
            },
          ],
          ranking: [
            { skillName: 'deleted-skill', countedInvocations: 1, failedInvocations: 1, lastInvokedAt: '2026-07-06T10:02:00Z', historical: true },
          ],
          diagnostics: [
            { provider: 'codex', message: 'Skipped ambiguous skill invocation evidence in session.jsonl:1' },
          ],
        }],
      },
    });
    const app = renderApp({
      manager,
      config: testConfig({ usage: { importConsent: true } }),
      terminalSize: { columns: 120, rows: 40 },
    });
    await waitForFrame(app, (output) => output.includes('* Skillpack') && !output.includes('Scanning skills'));

    app.stdin.write('g');

    await waitForFrame(app, (output) => (
      output.includes('2026-07-06 · Codex')
      && output.includes('Counted 1 · Failed 1')
      && output.includes('deleted-skill')
      && output.includes('historical')
      && output.includes('Skipped ambiguous skill invocation evidence')
    ));
  });

  it('switches the selected Skill Usage provider', async () => {
    const manager = createMockManager({
      usageOverview: {
        range: { days: 7, from: '2026-07-01', to: '2026-07-07' },
        providers: [
          {
            provider: 'codex',
            displayName: 'Codex',
            coverageState: 'zero',
            heatmap: [],
            dailySkillUsage: [],
            ranking: [],
            diagnostics: [],
          },
          {
            provider: 'claude',
            displayName: 'Claude',
            coverageState: 'active',
            heatmap: [
              { date: '2026-07-07', countedInvocations: 3, failedInvocations: 0 },
            ],
            dailySkillUsage: [
              {
                date: '2026-07-07',
                rows: [
                  { skillName: 'claude-skill', countedInvocations: 3, failedInvocations: 0, lastInvokedAt: '2026-07-07T10:00:00Z', historical: false },
                ],
              },
            ],
            ranking: [
              { skillName: 'claude-skill', countedInvocations: 3, failedInvocations: 0, lastInvokedAt: '2026-07-07T10:00:00Z', historical: false },
            ],
            diagnostics: [],
          },
        ],
      },
    });
    const app = renderApp({
      manager,
      config: testConfig({ usage: { importConsent: true } }),
    });
    await waitForFrame(app, (output) => output.includes('* Skillpack') && !output.includes('Scanning skills'));

    app.stdin.write('g');
    await waitForFrame(app, (output) => output.includes('[Codex zero]') && output.includes('Claude'));

    app.stdin.write(keypress.tab);

    await waitForFrame(app, (output) => (
      output.includes('Codex zero')
      && output.includes('[Claude]')
      && output.includes('claude-skill')
    ));
  });

  it('cycles Skill Usage ranges from 7 to 30 days', async () => {
    const manager = createMockManager();
    manager.getSkillUsageOverview.mockImplementation(async ({ rangeDays }) => ({
      range: { days: rangeDays, from: '2026-01-01', to: '2026-01-30' },
      providers: [{
        provider: 'codex',
        displayName: 'Codex',
        coverageState: 'zero',
        heatmap: [],
        dailySkillUsage: [],
        ranking: [],
        diagnostics: [],
      }],
    }));
    const app = renderApp({
      manager,
      config: testConfig({ usage: { importConsent: true } }),
    });
    await waitForFrame(app, (output) => output.includes('* Skillpack') && !output.includes('Scanning skills'));

    app.stdin.write('g');
    await waitForFrame(app, (output) => output.includes('Skill Usage') && output.includes('7 days'));

    app.stdin.write('2');

    await waitForFrame(app, (output) => output.includes('Skill Usage') && output.includes('30 days') && output.includes('[30d]'));
    expect(manager.getSkillUsageOverview).toHaveBeenCalledWith({ rangeDays: 30 });
  });

  it('manually rescans Skill Usage for the selected range', async () => {
    const manager = createMockManager();
    const app = renderApp({
      manager,
      config: testConfig({ usage: { importConsent: true } }),
    });
    await waitForFrame(app, (output) => output.includes('* Skillpack') && !output.includes('Scanning skills'));

    app.stdin.write('g');
    await waitForFrame(app, (output) => output.includes('Providers'));

    app.stdin.write('r');
    await waitForFrame(app, () => manager.importSkillUsage.mock.calls.length === 2);

    expect(manager.getSkillUsageOverview).toHaveBeenLastCalledWith({ rangeDays: 7 });
  });

  it('confirms Skill Usage Reset before deleting derived usage data', async () => {
    const manager = createMockManager();
    const app = renderApp({
      manager,
      config: testConfig({ usage: { importConsent: true } }),
    });
    await waitForFrame(app, (output) => output.includes('* Skillpack') && !output.includes('Scanning skills'));

    app.stdin.write('g');
    await waitForFrame(app, (output) => output.includes('Providers'));

    app.stdin.write('x');
    await waitForFrame(app, (output) => output.includes('Reset Skill Usage data?'));

    app.stdin.write('q');
    await waitForFrame(app, (output) => output.includes('Reset Skill Usage data?'));
    expect(manager.resetSkillUsage).not.toHaveBeenCalled();

    app.stdin.write('y');
    await waitForFrame(app, () => manager.resetSkillUsage.mock.calls.length === 1);

    expect(manager.getSkillUsageOverview).toHaveBeenLastCalledWith({ rangeDays: 7 });
  });
});
