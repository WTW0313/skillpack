import { BaseProvider, type ProviderCapabilities } from './provider.js';
import path from 'node:path';
import os from 'node:os';

export class CursorProvider extends BaseProvider {
  readonly id = 'cursor';
  readonly displayName = 'Cursor';
  readonly basePaths: string[];
  readonly capabilities: ProviderCapabilities = {
    canInstall: false, canUninstall: false, canUpdate: false, canToggle: true, canCreate: false,
  };
  constructor(basePaths?: string[]) {
    super();
    this.basePaths = basePaths ?? [path.join(os.homedir(), '.cursor', 'skills-cursor')];
  }
}
