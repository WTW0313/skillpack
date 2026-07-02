import { afterEach, describe, expect, it } from 'vitest';
import { inventoryGroup, inventoryInstance } from '../fixtures/inventory.js';
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
});
