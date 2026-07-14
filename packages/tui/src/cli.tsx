import React, { type ReactNode } from 'react';
import { render, type Instance, type RenderOptions } from 'ink';
import { App } from './app.js';

export const ENTER_ALTERNATE_SCREEN = '\x1B[?1049h';
export const RESET_CURSOR_POSITION = '\x1B[H';
export const HIDE_CURSOR = '\x1B[?25l';
export const SHOW_CURSOR = '\x1B[?25h';
export const EXIT_ALTERNATE_SCREEN = '\x1B[?1049l';

type RenderApp = (node: ReactNode, options: RenderOptions) => Pick<Instance, 'unmount' | 'waitUntilExit'>;

export interface SkillpackCliOptions {
  app?: ReactNode;
  renderApp?: RenderApp;
  stdout?: NodeJS.WriteStream;
  stdin?: NodeJS.ReadStream;
  stderr?: NodeJS.WriteStream;
  process?: NodeJS.Process;
  exit?: (code: number) => void;
}

function removeSignalHandler(processLike: NodeJS.Process, signal: NodeJS.Signals, handler: () => void): void {
  if (typeof processLike.off === 'function') {
    processLike.off(signal, handler);
    return;
  }
  processLike.removeListener(signal, handler);
}

export async function runSkillpackCli(options: SkillpackCliOptions = {}): Promise<void> {
  const processLike = options.process ?? process;
  const stdout = options.stdout ?? processLike.stdout;
  const stdin = options.stdin ?? processLike.stdin;
  const stderr = options.stderr ?? processLike.stderr;
  const renderApp = options.renderApp ?? render;
  const exit =
    options.exit ??
    ((code: number) => {
      processLike.exit(code);
    });
  const app = options.app ?? React.createElement(App);
  let instance: Pick<Instance, 'unmount' | 'waitUntilExit'> | null = null;
  let exitCode = 0;
  let error: unknown;

  const unmount = () => {
    instance?.unmount();
  };

  try {
    stdout.write(ENTER_ALTERNATE_SCREEN);
    stdout.write(RESET_CURSOR_POSITION);
    stdout.write(HIDE_CURSOR);

    instance = renderApp(app, {
      stdout,
      stdin,
      stderr,
      patchConsole: false,
    });

    processLike.on('SIGINT', unmount);
    processLike.on('SIGTERM', unmount);

    await instance.waitUntilExit();
  } catch (err) {
    exitCode = 1;
    error = err;
  } finally {
    removeSignalHandler(processLike, 'SIGINT', unmount);
    removeSignalHandler(processLike, 'SIGTERM', unmount);
    stdout.write(SHOW_CURSOR);
    stdout.write(EXIT_ALTERNATE_SCREEN);
    exit(exitCode);
  }

  if (error) throw error;
}
