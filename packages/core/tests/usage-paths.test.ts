import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { isSupportedClaudeArtifactPath } from '../src/usage-paths.js';

describe('Claude usage artifact paths', () => {
  it('accepts supported shapes only within the configured Windows artifact root', () => {
    const root = 'C:\\Users\\agent\\.claude\\projects';

    expect(isSupportedClaudeArtifactPath(
      root,
      'C:\\Users\\agent\\.claude\\projects\\encoded-cwd\\session-a.jsonl',
      path.win32,
    )).toBe(true);
    expect(isSupportedClaudeArtifactPath(
      root,
      'C:\\Users\\agent\\.claude\\projects\\encoded-cwd\\session-a\\subagents\\agent-a.jsonl',
      path.win32,
    )).toBe(true);
    expect(isSupportedClaudeArtifactPath(root, 'D:\\session-a.jsonl', path.win32)).toBe(false);
    expect(isSupportedClaudeArtifactPath(
      root,
      'D:\\session-a\\subagents\\agent-a.jsonl',
      path.win32,
    )).toBe(false);
    expect(isSupportedClaudeArtifactPath(
      '\\\\server-a\\claude\\projects',
      '\\\\server-b\\claude\\session-a.jsonl',
      path.win32,
    )).toBe(false);
  });
});
