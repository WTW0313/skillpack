import { BaseProvider, type ProviderCapabilities } from './provider.js';
import path from 'node:path';
import os from 'node:os';

export class GlobalProvider extends BaseProvider {
  readonly id = 'global';
  readonly displayName = 'Global';
  readonly basePaths: string[];
  readonly capabilities: ProviderCapabilities = {
    canToggle: false,
  };
  constructor(basePaths?: string[]) {
    super();
    this.basePaths = basePaths ?? [path.join(os.homedir(), '.agents', 'skills')];
  }
}
