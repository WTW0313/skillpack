#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from '../src/app.js';

const { waitUntilExit } = render(React.createElement(App), {
  patchConsole: false,
});

waitUntilExit().then(() => {
  process.exit(0);
});
