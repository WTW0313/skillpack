import { describe, expect, it, vi } from 'vite-plus/test';
import {
  ENTER_ALTERNATE_SCREEN,
  EXIT_ALTERNATE_SCREEN,
  HIDE_CURSOR,
  RESET_CURSOR_POSITION,
  SHOW_CURSOR,
  runSkillpackCli,
} from '../../src/cli.js';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createWritable() {
  const chunks: string[] = [];
  return {
    chunks,
    write: vi.fn((chunk: string) => {
      chunks.push(chunk);
      return true;
    }),
  };
}

function createProcessLike() {
  const handlers = new Map<string, Set<() => void>>();
  const stdout = createWritable();
  const stderr = createWritable();

  return {
    stdout,
    stderr,
    stdin: {},
    exit: vi.fn(),
    on: vi.fn((signal: string, handler: () => void) => {
      const existing = handlers.get(signal) ?? new Set();
      existing.add(handler);
      handlers.set(signal, existing);
      return undefined;
    }),
    off: vi.fn((signal: string, handler: () => void) => {
      handlers.get(signal)?.delete(handler);
      return undefined;
    }),
    removeListener: vi.fn((signal: string, handler: () => void) => {
      handlers.get(signal)?.delete(handler);
      return undefined;
    }),
    emitSignal(signal: string) {
      for (const handler of handlers.get(signal) ?? []) handler();
    },
  };
}

describe.sequential('runSkillpackCli', () => {
  it('writes terminal lifecycle sequences in order around the render lifecycle', async () => {
    const processLike = createProcessLike();
    const wait = deferred();
    const renderApp = vi.fn(() => ({
      unmount: vi.fn(),
      waitUntilExit: vi.fn(() => wait.promise),
    }));

    const run = runSkillpackCli({
      process: processLike as unknown as NodeJS.Process,
      renderApp,
      exit: processLike.exit,
    });

    expect(processLike.stdout.chunks).toEqual([ENTER_ALTERNATE_SCREEN, RESET_CURSOR_POSITION, HIDE_CURSOR]);

    wait.resolve();
    await run;

    expect(processLike.stdout.chunks).toEqual([
      ENTER_ALTERNATE_SCREEN,
      RESET_CURSOR_POSITION,
      HIDE_CURSOR,
      SHOW_CURSOR,
      EXIT_ALTERNATE_SCREEN,
    ]);
    expect(processLike.exit).toHaveBeenCalledWith(0);
    expect(processLike.off).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(processLike.off).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
  });

  it('unmounts the Ink app when SIGTERM is received', async () => {
    const processLike = createProcessLike();
    const wait = deferred();
    const unmount = vi.fn(() => wait.resolve());
    const renderApp = vi.fn(() => ({
      unmount,
      waitUntilExit: vi.fn(() => wait.promise),
    }));

    const run = runSkillpackCli({
      process: processLike as unknown as NodeJS.Process,
      renderApp,
      exit: processLike.exit,
    });

    processLike.emitSignal('SIGTERM');
    await run;

    expect(unmount).toHaveBeenCalledTimes(1);
    expect(processLike.exit).toHaveBeenCalledWith(0);
  });

  it('restores the terminal before surfacing render lifecycle failures', async () => {
    const processLike = createProcessLike();
    const renderApp = vi.fn(() => ({
      unmount: vi.fn(),
      waitUntilExit: vi.fn(async () => {
        throw new Error('render failed');
      }),
    }));

    await expect(
      runSkillpackCli({
        process: processLike as unknown as NodeJS.Process,
        renderApp,
        exit: processLike.exit,
      }),
    ).rejects.toThrow('render failed');

    expect(processLike.stdout.chunks).toContain(SHOW_CURSOR);
    expect(processLike.stdout.chunks).toContain(EXIT_ALTERNATE_SCREEN);
    expect(processLike.exit).toHaveBeenCalledWith(1);
  });
});
