#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from '../src/app.js';

process.stdout.write('\x1B[?1049h');
process.stdout.write('\x1B[H');
process.stdout.write('\x1B[?25l');

const { waitUntilExit, unmount } = render(React.createElement(App), {
  patchConsole: false,
});

function exit() {
  unmount();
}

process.on('SIGINT', exit);
process.on('SIGTERM', exit);

waitUntilExit().then(() => {
  process.stdout.write('\x1B[?25h');
  process.stdout.write('\x1B[?1049l');
  process.exit(0);
});
