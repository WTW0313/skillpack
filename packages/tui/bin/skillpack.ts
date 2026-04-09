#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from '../src/app.js';

process.stdout.write('\x1B[?1049h');
process.stdout.write('\x1B[H');
process.stdout.write('\x1B[?25l');

function cleanup() {
  process.stdout.write('\x1B[?25h');
  process.stdout.write('\x1B[?1049l');
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

const { waitUntilExit } = render(React.createElement(App), {
  patchConsole: false,
});

waitUntilExit().then(() => {
  process.exit(0);
});
