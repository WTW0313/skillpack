import React from 'react';
import { render } from 'ink-testing-library';
import { AppSurface } from '../../src/app.js';
import type { SkillGroup, SkillManager, SkillpackConfig } from '@skillpack/core';
import type { TerminalSize } from '../../src/lib/responsive-layout.js';
import { testConfig } from '../fixtures/inventory.js';
import { createMockManager, type MockSkillManager } from './mock-manager.js';

type InkTestInstance = ReturnType<typeof render>;

export interface RenderTuiOptions {
  manager?: MockSkillManager;
  inventory?: SkillGroup[];
  config?: SkillpackConfig;
  onUsageImportConsentChange?: (importConsent: boolean) => Promise<SkillpackConfig>;
  terminalSize?: TerminalSize;
  error?: string | null;
}

export interface RenderTuiResult extends InkTestInstance {
  manager: MockSkillManager;
  config: SkillpackConfig;
  normalizedFrame: () => string;
  dispose: () => void;
}

export const keypress = {
  enter: '\r',
  escape: '\x1B',
  down: '\x1B[B',
  up: '\x1B[A',
  left: '\x1B[D',
  right: '\x1B[C',
  tab: '\t',
};

export function stripAnsi(value: string): string {
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

export function normalizeFrame(frame: string | undefined): string {
  return stripAnsi(frame ?? '')
    .replace(/\r/g, '')
    .replace(/[ \t]+$/gm, '')
    .trimEnd();
}

export function renderTui(options: RenderTuiOptions = {}): RenderTuiResult {
  const previousAscii = process.env.SKILLPACK_ASCII;
  process.env.SKILLPACK_ASCII = '1';

  const manager = options.manager ?? createMockManager({ inventory: options.inventory });
  const config = options.config ?? testConfig();
  const result = render(
    <AppSurface
      manager={manager as SkillManager}
      config={config}
      error={options.error ?? null}
      onUsageImportConsentChange={options.onUsageImportConsentChange}
      terminalSize={options.terminalSize ?? { columns: 80, rows: 24 }}
    />,
  );

  const restoreEnv = () => {
    if (previousAscii === undefined) {
      delete process.env.SKILLPACK_ASCII;
    } else {
      process.env.SKILLPACK_ASCII = previousAscii;
    }
  };

  return {
    ...result,
    manager,
    config,
    normalizedFrame: () => normalizeFrame(result.lastFrame()),
    dispose: () => {
      result.unmount();
      result.cleanup();
      restoreEnv();
    },
  };
}

export async function waitForFrame(
  result: Pick<RenderTuiResult, 'normalizedFrame'>,
  predicate: (frame: string) => boolean,
  timeoutMs = 1000,
): Promise<string> {
  const startedAt = Date.now();
  let frame = result.normalizedFrame();

  while (Date.now() - startedAt < timeoutMs) {
    frame = result.normalizedFrame();
    if (predicate(frame)) return frame;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for frame.\n\nLast frame:\n${frame}`);
}
