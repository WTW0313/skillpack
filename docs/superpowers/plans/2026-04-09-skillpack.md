# Skillpack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TUI application that unifies management of agent skills across multiple platforms (Codex, Cursor, Claude, skills.sh), with install, update, create, edit, conflict detection, and version locking.

**Architecture:** Monorepo with two packages — `@skillpack/core` (platform-agnostic logic: providers, sources, models, lock files) and `@skillpack/tui` (Ink-based terminal UI). Core exposes a `SkillManager` that coordinates providers and sources. TUI consumes core's API.

**Tech Stack:** TypeScript, Ink 6.x, React 18, @inkjs/ui, gray-matter, fuse.js

**Spec:** `docs/superpowers/specs/2026-04-09-skillpack-design.md`

---

## File Structure

```
skillpack/
├── package.json                          # npm workspaces root
├── tsconfig.json                         # base tsconfig
├── packages/
│   ├── core/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                  # public API barrel export
│   │   │   ├── models/
│   │   │   │   ├── skill.ts              # Skill, SkillTemplate, RemoteSkill interfaces
│   │   │   │   ├── conflict.ts           # ConflictInfo, DiffResult
│   │   │   │   ├── source.ts             # InstallRequest, UpdateInfo, DownloadResult
│   │   │   │   └── index.ts
│   │   │   ├── parser.ts                 # SKILL.md frontmatter parser
│   │   │   ├── lockfile.ts               # Lock file read/write/verify
│   │   │   ├── config.ts                 # Config file manager (~/.config/skillpack/)
│   │   │   ├── providers/
│   │   │   │   ├── provider.ts           # ISkillProvider interface + BaseProvider
│   │   │   │   ├── codex.ts
│   │   │   │   ├── cursor.ts
│   │   │   │   ├── claude.ts
│   │   │   │   ├── skillssh.ts
│   │   │   │   └── index.ts
│   │   │   ├── sources/
│   │   │   │   ├── source.ts             # IInstallSource interface
│   │   │   │   ├── github.ts
│   │   │   │   ├── skillssh.ts
│   │   │   │   └── index.ts
│   │   │   ├── conflicts.ts              # ConflictDetector
│   │   │   └── manager.ts               # SkillManager (central coordinator)
│   │   └── tests/
│   │       ├── parser.test.ts
│   │       ├── lockfile.test.ts
│   │       ├── conflicts.test.ts
│   │       ├── providers/
│   │       │   └── codex.test.ts         # representative provider test
│   │       └── manager.test.ts
│   └── tui/
│       ├── package.json
│       ├── tsconfig.json
│       ├── bin/
│       │   └── skillpack.ts              # CLI entry point (#!/usr/bin/env node)
│       └── src/
│           ├── app.tsx                   # Root Ink <App /> component
│           ├── hooks/
│           │   ├── use-skill-manager.ts  # Initialize & provide SkillManager
│           │   ├── use-skills.ts         # Skill list state + filtering
│           │   └── use-search.ts         # Fuse.js fuzzy search
│           ├── components/
│           │   ├── tab-bar.tsx           # [All] [Codex] [Cursor] ...
│           │   ├── skill-list.tsx        # Scrollable skill list with indicators
│           │   ├── skill-row.tsx         # Single row: name, provider, status, conflict
│           │   ├── status-bar.tsx        # Bottom hotkey bar
│           │   ├── search-input.tsx      # / search overlay
│           │   └── confirm-dialog.tsx    # Yes/No confirmation
│           ├── views/
│           │   ├── list-view.tsx         # Main list view (tabs + list + status)
│           │   ├── detail-view.tsx       # Skill detail page
│           │   ├── install-view.tsx      # Install wizard flow
│           │   ├── create-view.tsx       # Create skill wizard
│           │   └── update-view.tsx       # Update confirmation view
│           └── context/
│               └── app-context.tsx       # React context for SkillManager + state
```

---

## Task 1: Monorepo Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/tui/package.json`
- Create: `packages/tui/tsconfig.json`

- [ ] **Step 1: Create root package.json with npm workspaces**

```json
{
  "name": "skillpack",
  "version": "0.1.0",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces",
    "dev": "npm run dev --workspace=packages/tui"
  }
}
```

- [ ] **Step 2: Create root tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 3: Create packages/core/package.json**

```json
{
  "name": "@skillpack/core",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "gray-matter": "^4.0.3",
    "glob": "^11.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 4: Create packages/core/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["tests/**/*", "dist"]
}
```

- [ ] **Step 5: Create packages/tui/package.json**

```json
{
  "name": "@skillpack/tui",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "skillpack": "./dist/bin/skillpack.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run"
  },
  "dependencies": {
    "@skillpack/core": "*",
    "ink": "^6.5.0",
    "react": "^18.3.0",
    "@inkjs/ui": "^2.0.0",
    "fuse.js": "^7.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/react": "^18.3.0",
    "vitest": "^3.0.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 6: Create packages/tui/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": ".",
    "jsx": "react-jsx",
    "references": [{ "path": "../core" }]
  },
  "include": ["src/**/*", "bin/**/*"],
  "exclude": ["dist"]
}
```

- [ ] **Step 7: Install dependencies**

Run: `npm install`

Expected: Successful install, `node_modules` created, workspaces linked.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold monorepo with core and tui packages"
```

---

## Task 2: Core Data Models

**Files:**
- Create: `packages/core/src/models/skill.ts`
- Create: `packages/core/src/models/conflict.ts`
- Create: `packages/core/src/models/source.ts`
- Create: `packages/core/src/models/index.ts`

- [ ] **Step 1: Create Skill model**

Write `packages/core/src/models/skill.ts`:

```typescript
export interface SkillMetadata {
  license?: string;
  author?: string;
  tags?: string[];
}

export interface SkillSource {
  type: 'github' | 'skillssh' | 'local';
  repo?: string;
  ref?: string;
  commit?: string;
  createdAt?: string;
  installedAt?: string;
  forkedFrom?: {
    source: 'github' | 'skillssh';
    identifier: string;
  };
}

export interface Skill {
  name: string;
  description: string;
  provider: string;
  path: string;
  version?: string;
  enabled: boolean;
  scope: 'global' | 'project';
  readonly: boolean;
  metadata: SkillMetadata;
  source?: SkillSource;
}

export interface SkillTemplate {
  name: string;
  description: string;
  metadata?: Partial<SkillMetadata>;
}
```

- [ ] **Step 2: Create Conflict model**

Write `packages/core/src/models/conflict.ts`:

```typescript
export interface ConflictInstance {
  provider: string;
  path: string;
  version?: string;
}

export interface ConflictInfo {
  skillName: string;
  instances: ConflictInstance[];
}

export interface DiffChange {
  field: string;
  a: string;
  b: string;
}

export interface DiffResult {
  identical: boolean;
  changes: DiffChange[];
}
```

- [ ] **Step 3: Create Source model**

Write `packages/core/src/models/source.ts`:

```typescript
export interface InstallRequest {
  sourceType: 'github' | 'skillssh';
  identifier: string;
  tempDir: string;
}

export interface RemoteSkill {
  name: string;
  description: string;
  source: 'github' | 'skillssh';
  identifier: string;
  stars?: number;
  installs?: number;
  version?: string;
}

export interface UpdateInfo {
  currentVersion?: string;
  latestVersion?: string;
  hasUpdate: boolean;
  changelog?: string;
}

export interface DownloadResult {
  tempDir: string;
  skillName: string;
  files: string[];
}
```

- [ ] **Step 4: Create barrel export**

Write `packages/core/src/models/index.ts`:

```typescript
export * from './skill.js';
export * from './conflict.js';
export * from './source.js';
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): add data model interfaces"
```

---

## Task 3: SKILL.md Parser

**Files:**
- Create: `packages/core/src/parser.ts`
- Create: `packages/core/tests/parser.test.ts`

- [ ] **Step 1: Write the failing test**

Write `packages/core/tests/parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseSkillMd, generateSkillMd } from '../src/parser.js';

describe('parseSkillMd', () => {
  it('parses valid SKILL.md with frontmatter', () => {
    const content = `---
name: my-skill
description: A test skill
---

# My Skill

## Instructions

Do the thing.
`;
    const result = parseSkillMd(content);
    expect(result.name).toBe('my-skill');
    expect(result.description).toBe('A test skill');
    expect(result.body).toContain('# My Skill');
    expect(result.body).toContain('Do the thing.');
  });

  it('parses optional metadata fields', () => {
    const content = `---
name: my-skill
description: A test skill
license: MIT
---

# Content
`;
    const result = parseSkillMd(content);
    expect(result.metadata.license).toBe('MIT');
  });

  it('returns empty description when missing', () => {
    const content = `---
name: my-skill
---

# Content
`;
    const result = parseSkillMd(content);
    expect(result.name).toBe('my-skill');
    expect(result.description).toBe('');
  });

  it('handles file with no frontmatter', () => {
    const content = `# Just Markdown

No frontmatter here.
`;
    const result = parseSkillMd(content);
    expect(result.name).toBe('');
    expect(result.body).toContain('# Just Markdown');
  });
});

describe('generateSkillMd', () => {
  it('generates SKILL.md from template', () => {
    const md = generateSkillMd({ name: 'test-skill', description: 'A skill' });
    expect(md).toContain('name: test-skill');
    expect(md).toContain('description: A skill');
    expect(md).toContain('# Test Skill');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run tests/parser.test.ts`

Expected: FAIL — `parseSkillMd` not found.

- [ ] **Step 3: Implement parser**

Write `packages/core/src/parser.ts`:

```typescript
import matter from 'gray-matter';
import type { SkillMetadata } from './models/index.js';

export interface ParsedSkillMd {
  name: string;
  description: string;
  body: string;
  metadata: Partial<SkillMetadata>;
  raw: Record<string, unknown>;
}

export function parseSkillMd(content: string): ParsedSkillMd {
  const { data, content: body } = matter(content);

  return {
    name: typeof data.name === 'string' ? data.name : '',
    description: typeof data.description === 'string' ? data.description : '',
    body: body.trim(),
    metadata: {
      license: typeof data.license === 'string' ? data.license : undefined,
      author: typeof data.author === 'string' ? data.author : undefined,
      tags: Array.isArray(data.tags) ? data.tags : undefined,
    },
    raw: data,
  };
}

function kebabToTitle(s: string): string {
  return s
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function generateSkillMd(template: { name: string; description: string; metadata?: Partial<SkillMetadata> }): string {
  const frontmatter: Record<string, unknown> = {
    name: template.name,
    description: template.description,
  };
  if (template.metadata?.license) frontmatter.license = template.metadata.license;
  if (template.metadata?.author) frontmatter.author = template.metadata.author;
  if (template.metadata?.tags) frontmatter.tags = template.metadata.tags;

  const fm = matter.stringify('', frontmatter).trim();
  const title = kebabToTitle(template.name);

  return `${fm}

# ${title}

## When to Use This Skill

<!-- Describe trigger conditions -->

## Instructions

<!-- Core instructions for the agent -->
`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run tests/parser.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): add SKILL.md parser with gray-matter"
```

---

## Task 4: Lock File Manager

**Files:**
- Create: `packages/core/src/lockfile.ts`
- Create: `packages/core/tests/lockfile.test.ts`

- [ ] **Step 1: Write the failing test**

Write `packages/core/tests/lockfile.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LockfileManager } from '../src/lockfile.js';

describe('LockfileManager', () => {
  let dir: string;
  let lm: LockfileManager;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'skillpack-lock-'));
    lm = new LockfileManager(path.join(dir, 'skillpack.lock'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('creates a new lock file when none exists', async () => {
    await lm.load();
    expect(lm.getEntries()).toEqual({});
  });

  it('adds and persists an entry', async () => {
    await lm.load();
    lm.setEntry('my-skill', {
      source: 'github',
      repo: 'owner/repo',
      commit: 'abc123',
      installedAt: '2026-04-09T00:00:00Z',
      integrity: 'sha256-test',
    });
    await lm.save();

    const raw = JSON.parse(await readFile(path.join(dir, 'skillpack.lock'), 'utf-8'));
    expect(raw.skills['my-skill'].commit).toBe('abc123');
  });

  it('removes an entry', async () => {
    await lm.load();
    lm.setEntry('my-skill', {
      source: 'github',
      repo: 'owner/repo',
      commit: 'abc123',
      installedAt: '2026-04-09T00:00:00Z',
      integrity: 'sha256-test',
    });
    lm.removeEntry('my-skill');
    await lm.save();

    const raw = JSON.parse(await readFile(path.join(dir, 'skillpack.lock'), 'utf-8'));
    expect(raw.skills['my-skill']).toBeUndefined();
  });

  it('roundtrips load -> save -> load', async () => {
    await lm.load();
    lm.setEntry('a', { source: 'skillssh', identifier: 'pkg@a', version: '1.0.0', installedAt: '2026-04-09T00:00:00Z', integrity: 'sha256-aaa' });
    await lm.save();

    const lm2 = new LockfileManager(path.join(dir, 'skillpack.lock'));
    await lm2.load();
    const entry = lm2.getEntry('a');
    expect(entry?.version).toBe('1.0.0');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run tests/lockfile.test.ts`

Expected: FAIL — `LockfileManager` not found.

- [ ] **Step 3: Implement LockfileManager**

Write `packages/core/src/lockfile.ts`:

```typescript
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export interface LockEntry {
  source: string;
  identifier?: string;
  repo?: string;
  ref?: string;
  commit?: string;
  path?: string;
  version?: string;
  installedAt: string;
  integrity: string;
}

interface LockfileData {
  lockfileVersion: number;
  skills: Record<string, LockEntry>;
}

export class LockfileManager {
  private filePath: string;
  private data: LockfileData = { lockfileVersion: 1, skills: {} };

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      this.data = JSON.parse(raw);
    } catch {
      this.data = { lockfileVersion: 1, skills: {} };
    }
  }

  async save(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2) + '\n', 'utf-8');
  }

  getEntries(): Record<string, LockEntry> {
    return { ...this.data.skills };
  }

  getEntry(name: string): LockEntry | undefined {
    return this.data.skills[name];
  }

  setEntry(name: string, entry: LockEntry): void {
    this.data.skills[name] = entry;
  }

  removeEntry(name: string): void {
    delete this.data.skills[name];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run tests/lockfile.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): add lock file manager for version pinning"
```

---

## Task 5: Config Manager

**Files:**
- Create: `packages/core/src/config.ts`

- [ ] **Step 1: Implement ConfigManager**

Write `packages/core/src/config.ts`:

```typescript
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export interface ProviderConfig {
  enabled: boolean;
  paths: string[];
}

export interface SourceConfig {
  enabled: boolean;
}

export interface SkillpackConfig {
  editor: string;
  autoCheckUpdates: boolean;
  projectSkillsDir: string;
  providers: Record<string, ProviderConfig>;
  sources: Record<string, SourceConfig>;
}

const DEFAULT_CONFIG: SkillpackConfig = {
  editor: process.env.EDITOR || 'vi',
  autoCheckUpdates: true,
  projectSkillsDir: '.skillpack/skills',
  providers: {
    codex: { enabled: true, paths: [path.join(os.homedir(), '.codex', 'skills')] },
    cursor: { enabled: true, paths: [path.join(os.homedir(), '.cursor', 'skills-cursor')] },
    claude: { enabled: true, paths: [path.join(os.homedir(), '.claude', 'plugins', 'cache')] },
    skillssh: { enabled: true, paths: [path.join(os.homedir(), '.agents', 'skills')] },
  },
  sources: {
    github: { enabled: true },
    skillssh: { enabled: true },
  },
};

export class ConfigManager {
  private configPath: string;
  private config: SkillpackConfig = { ...DEFAULT_CONFIG };

  constructor(configDir?: string) {
    const dir = configDir ?? path.join(os.homedir(), '.config', 'skillpack');
    this.configPath = path.join(dir, 'config.json');
  }

  async load(): Promise<SkillpackConfig> {
    try {
      const raw = await readFile(this.configPath, 'utf-8');
      this.config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch {
      this.config = { ...DEFAULT_CONFIG };
      await this.autoDetectProviders();
    }
    return this.config;
  }

  async save(): Promise<void> {
    await mkdir(path.dirname(this.configPath), { recursive: true });
    await writeFile(this.configPath, JSON.stringify(this.config, null, 2) + '\n', 'utf-8');
  }

  getConfig(): SkillpackConfig {
    return this.config;
  }

  private async autoDetectProviders(): Promise<void> {
    for (const [id, provider] of Object.entries(this.config.providers)) {
      let found = false;
      for (const p of provider.paths) {
        try {
          await access(p);
          found = true;
          break;
        } catch { /* not found */ }
      }
      this.config.providers[id].enabled = found;
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(core): add config manager with auto-detection"
```

---

## Task 6: Provider Interface & Base Class

**Files:**
- Create: `packages/core/src/providers/provider.ts`
- Create: `packages/core/src/providers/index.ts`

- [ ] **Step 1: Define provider interface and base class**

Write `packages/core/src/providers/provider.ts`:

```typescript
import type { Skill, SkillTemplate } from '../models/index.js';
import type { InstallRequest } from '../models/source.js';
import { readdir, access } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseSkillMd } from '../parser.js';

export interface ProviderCapabilities {
  canInstall: boolean;
  canUninstall: boolean;
  canUpdate: boolean;
  canToggle: boolean;
  canCreate: boolean;
}

export interface ISkillProvider {
  readonly id: string;
  readonly displayName: string;
  readonly basePaths: string[];
  readonly capabilities: ProviderCapabilities;

  scan(): Promise<Skill[]>;
  install(name: string, request: InstallRequest): Promise<void>;
  uninstall(name: string): Promise<void>;
  update(name: string): Promise<void>;
  enable(name: string): Promise<void>;
  disable(name: string): Promise<void>;
  create(template: SkillTemplate): Promise<Skill>;
}

export abstract class BaseProvider implements ISkillProvider {
  abstract readonly id: string;
  abstract readonly displayName: string;
  abstract readonly basePaths: string[];
  abstract readonly capabilities: ProviderCapabilities;

  async scan(): Promise<Skill[]> {
    const skills: Skill[] = [];
    for (const basePath of this.basePaths) {
      try {
        await access(basePath);
      } catch {
        continue;
      }
      const entries = await readdir(basePath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        const skillDir = path.join(basePath, entry.name);
        const skillMdPath = path.join(skillDir, 'SKILL.md');
        try {
          const content = await readFile(skillMdPath, 'utf-8');
          const parsed = parseSkillMd(content);
          skills.push({
            name: parsed.name || entry.name,
            description: parsed.description,
            provider: this.id,
            path: skillDir,
            version: parsed.raw.version as string | undefined,
            enabled: true,
            scope: 'global',
            readonly: true,
            metadata: {
              license: parsed.metadata.license,
              author: parsed.metadata.author,
              tags: parsed.metadata.tags,
            },
          });
        } catch {
          // no SKILL.md or unreadable — skip
        }
      }
    }
    return skills;
  }

  async install(_name: string, _request: InstallRequest): Promise<void> {
    throw new Error(`${this.displayName} provider does not support install`);
  }

  async uninstall(_name: string): Promise<void> {
    throw new Error(`${this.displayName} provider does not support uninstall`);
  }

  async update(_name: string): Promise<void> {
    throw new Error(`${this.displayName} provider does not support update`);
  }

  async enable(_name: string): Promise<void> {
    throw new Error(`${this.displayName} provider does not support enable`);
  }

  async disable(_name: string): Promise<void> {
    throw new Error(`${this.displayName} provider does not support disable`);
  }

  async create(_template: SkillTemplate): Promise<Skill> {
    throw new Error(`${this.displayName} provider does not support create`);
  }
}
```

- [ ] **Step 2: Create barrel export**

Write `packages/core/src/providers/index.ts`:

```typescript
export { type ISkillProvider, type ProviderCapabilities, BaseProvider } from './provider.js';
export { CodexProvider } from './codex.js';
export { CursorProvider } from './cursor.js';
export { ClaudeProvider } from './claude.js';
export { SkillsShProvider } from './skillssh.js';
```

Note: The individual provider files will be created in following tasks. Create this file after all providers are implemented.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(core): add provider interface and base class with scan"
```

---

## Task 7: Codex Provider

**Files:**
- Create: `packages/core/src/providers/codex.ts`
- Create: `packages/core/tests/providers/codex.test.ts`

- [ ] **Step 1: Write the failing test**

Write `packages/core/tests/providers/codex.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CodexProvider } from '../../src/providers/codex.js';

describe('CodexProvider', () => {
  let dir: string;
  let provider: CodexProvider;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'skillpack-codex-'));
    provider = new CodexProvider([dir]);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('scans skills from directory', async () => {
    const skillDir = path.join(dir, 'test-skill');
    await mkdir(skillDir);
    await writeFile(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: test-skill\ndescription: A test\n---\n\n# Test\n',
    );

    const skills = await provider.scan();
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('test-skill');
    expect(skills[0].provider).toBe('codex');
  });

  it('skips directories without SKILL.md', async () => {
    await mkdir(path.join(dir, 'empty-dir'));
    const skills = await provider.scan();
    expect(skills).toHaveLength(0);
  });

  it('creates a new skill', async () => {
    const skill = await provider.create({ name: 'new-skill', description: 'Brand new' });
    expect(skill.name).toBe('new-skill');
    expect(skill.readonly).toBe(false);
    expect(skill.source?.type).toBe('local');
  });

  it('uninstalls a skill', async () => {
    const skillDir = path.join(dir, 'to-delete');
    await mkdir(skillDir);
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: to-delete\ndescription: Delete me\n---\n');

    await provider.uninstall('to-delete');
    const skills = await provider.scan();
    expect(skills).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run tests/providers/codex.test.ts`

Expected: FAIL — `CodexProvider` not found.

- [ ] **Step 3: Implement CodexProvider**

Write `packages/core/src/providers/codex.ts`:

```typescript
import { BaseProvider, type ProviderCapabilities } from './provider.js';
import type { Skill, SkillTemplate } from '../models/index.js';
import type { InstallRequest } from '../models/source.js';
import { generateSkillMd } from '../parser.js';
import { mkdir, writeFile, rm, cp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export class CodexProvider extends BaseProvider {
  readonly id = 'codex';
  readonly displayName = 'Codex';
  readonly basePaths: string[];
  readonly capabilities: ProviderCapabilities = {
    canInstall: true,
    canUninstall: true,
    canUpdate: true,
    canToggle: false,
    canCreate: true,
  };

  constructor(basePaths?: string[]) {
    super();
    this.basePaths = basePaths ?? [path.join(os.homedir(), '.codex', 'skills')];
  }

  override async install(name: string, request: InstallRequest): Promise<void> {
    const dest = path.join(this.basePaths[0], name);
    await cp(request.tempDir, dest, { recursive: true });
  }

  override async uninstall(name: string): Promise<void> {
    const skillPath = path.join(this.basePaths[0], name);
    await rm(skillPath, { recursive: true, force: true });
  }

  override async create(template: SkillTemplate): Promise<Skill> {
    const skillDir = path.join(this.basePaths[0], template.name);
    await mkdir(skillDir, { recursive: true });
    const content = generateSkillMd(template);
    await writeFile(path.join(skillDir, 'SKILL.md'), content, 'utf-8');

    return {
      name: template.name,
      description: template.description,
      provider: this.id,
      path: skillDir,
      enabled: true,
      scope: 'global',
      readonly: false,
      metadata: template.metadata ?? {},
      source: { type: 'local', createdAt: new Date().toISOString() },
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run tests/providers/codex.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): add Codex provider with scan, install, uninstall, create"
```

---

## Task 8: Cursor, Claude, and skills.sh Providers

**Files:**
- Create: `packages/core/src/providers/cursor.ts`
- Create: `packages/core/src/providers/claude.ts`
- Create: `packages/core/src/providers/skillssh.ts`

These follow the same pattern as CodexProvider with platform-specific differences.

- [ ] **Step 1: Implement CursorProvider**

Write `packages/core/src/providers/cursor.ts`:

```typescript
import { BaseProvider, type ProviderCapabilities } from './provider.js';
import path from 'node:path';
import os from 'node:os';

export class CursorProvider extends BaseProvider {
  readonly id = 'cursor';
  readonly displayName = 'Cursor';
  readonly basePaths: string[];
  readonly capabilities: ProviderCapabilities = {
    canInstall: false,
    canUninstall: false,
    canUpdate: false,
    canToggle: false,
    canCreate: false,
  };

  constructor(basePaths?: string[]) {
    super();
    this.basePaths = basePaths ?? [path.join(os.homedir(), '.cursor', 'skills-cursor')];
  }
}
```

Cursor provider is read-only — skills are managed by Cursor itself.

- [ ] **Step 2: Implement ClaudeProvider**

Write `packages/core/src/providers/claude.ts`:

The Claude plugins cache has a nested structure: `cache/<publisher>/<plugin>/<version>/skills/<skill-name>/`. Override `scan()` to walk this deeper hierarchy.

```typescript
import { BaseProvider, type ProviderCapabilities } from './provider.js';
import type { Skill } from '../models/index.js';
import { readdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseSkillMd } from '../parser.js';

export class ClaudeProvider extends BaseProvider {
  readonly id = 'claude';
  readonly displayName = 'Claude';
  readonly basePaths: string[];
  readonly capabilities: ProviderCapabilities = {
    canInstall: false,
    canUninstall: false,
    canUpdate: false,
    canToggle: false,
    canCreate: false,
  };

  constructor(basePaths?: string[]) {
    super();
    this.basePaths = basePaths ?? [path.join(os.homedir(), '.claude', 'plugins', 'cache')];
  }

  override async scan(): Promise<Skill[]> {
    const skills: Skill[] = [];
    for (const basePath of this.basePaths) {
      try { await access(basePath); } catch { continue; }
      const publishers = await readdir(basePath, { withFileTypes: true });
      for (const pub of publishers) {
        if (!pub.isDirectory()) continue;
        const plugins = await readdir(path.join(basePath, pub.name), { withFileTypes: true });
        for (const plugin of plugins) {
          if (!plugin.isDirectory()) continue;
          const versions = await readdir(path.join(basePath, pub.name, plugin.name), { withFileTypes: true });
          for (const ver of versions) {
            if (!ver.isDirectory()) continue;
            const skillsDir = path.join(basePath, pub.name, plugin.name, ver.name, 'skills');
            try { await access(skillsDir); } catch { continue; }
            const skillEntries = await readdir(skillsDir, { withFileTypes: true });
            for (const entry of skillEntries) {
              if (!entry.isDirectory()) continue;
              const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');
              try {
                const content = await readFile(skillMdPath, 'utf-8');
                const parsed = parseSkillMd(content);
                skills.push({
                  name: parsed.name || entry.name,
                  description: parsed.description,
                  provider: this.id,
                  path: path.join(skillsDir, entry.name),
                  version: ver.name !== 'unknown' ? ver.name : undefined,
                  enabled: true,
                  scope: 'global',
                  readonly: true,
                  metadata: {
                    license: parsed.metadata.license,
                    author: parsed.metadata.author ?? pub.name,
                    tags: parsed.metadata.tags,
                  },
                });
              } catch { /* skip */ }
            }
          }
        }
      }
    }
    return skills;
  }
}
```

- [ ] **Step 3: Implement SkillsShProvider**

Write `packages/core/src/providers/skillssh.ts`:

```typescript
import { BaseProvider, type ProviderCapabilities } from './provider.js';
import type { Skill, SkillTemplate } from '../models/index.js';
import { generateSkillMd } from '../parser.js';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export class SkillsShProvider extends BaseProvider {
  readonly id = 'skillssh';
  readonly displayName = 'skills.sh';
  readonly basePaths: string[];
  readonly capabilities: ProviderCapabilities = {
    canInstall: true,
    canUninstall: true,
    canUpdate: true,
    canToggle: false,
    canCreate: true,
  };

  constructor(basePaths?: string[]) {
    super();
    this.basePaths = basePaths ?? [path.join(os.homedir(), '.agents', 'skills')];
  }

  override async uninstall(name: string): Promise<void> {
    const skillPath = path.join(this.basePaths[0], name);
    await rm(skillPath, { recursive: true, force: true });
  }

  override async create(template: SkillTemplate): Promise<Skill> {
    const skillDir = path.join(this.basePaths[0], template.name);
    await mkdir(skillDir, { recursive: true });
    const content = generateSkillMd(template);
    await writeFile(path.join(skillDir, 'SKILL.md'), content, 'utf-8');

    return {
      name: template.name,
      description: template.description,
      provider: this.id,
      path: skillDir,
      enabled: true,
      scope: 'global',
      readonly: false,
      metadata: template.metadata ?? {},
      source: { type: 'local', createdAt: new Date().toISOString() },
    };
  }
}
```

- [ ] **Step 4: Create provider barrel export**

Write `packages/core/src/providers/index.ts`:

```typescript
export { type ISkillProvider, type ProviderCapabilities, BaseProvider } from './provider.js';
export { CodexProvider } from './codex.js';
export { CursorProvider } from './cursor.js';
export { ClaudeProvider } from './claude.js';
export { SkillsShProvider } from './skillssh.js';
```

- [ ] **Step 5: Run all tests**

Run: `cd packages/core && npx vitest run`

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(core): add Cursor, Claude, and skills.sh providers"
```

---

## Task 9: Conflict Detector

**Files:**
- Create: `packages/core/src/conflicts.ts`
- Create: `packages/core/tests/conflicts.test.ts`

- [ ] **Step 1: Write the failing test**

Write `packages/core/tests/conflicts.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ConflictDetector } from '../src/conflicts.js';
import type { Skill } from '../src/models/index.js';

function makeSkill(name: string, provider: string): Skill {
  return {
    name,
    description: '',
    provider,
    path: `/fake/${provider}/${name}`,
    enabled: true,
    scope: 'global',
    readonly: true,
    metadata: {},
  };
}

describe('ConflictDetector', () => {
  const detector = new ConflictDetector();

  it('detects no conflicts when names are unique', () => {
    const skills = [makeSkill('a', 'codex'), makeSkill('b', 'cursor')];
    expect(detector.detect(skills)).toHaveLength(0);
  });

  it('detects conflict when same name across providers', () => {
    const skills = [
      makeSkill('figma', 'codex'),
      makeSkill('figma', 'cursor'),
      makeSkill('other', 'codex'),
    ];
    const conflicts = detector.detect(skills);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].skillName).toBe('figma');
    expect(conflicts[0].instances).toHaveLength(2);
  });

  it('detects multiple conflicts', () => {
    const skills = [
      makeSkill('a', 'codex'),
      makeSkill('a', 'cursor'),
      makeSkill('b', 'codex'),
      makeSkill('b', 'claude'),
      makeSkill('b', 'skillssh'),
    ];
    const conflicts = detector.detect(skills);
    expect(conflicts).toHaveLength(2);
    expect(conflicts.find((c) => c.skillName === 'b')?.instances).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run tests/conflicts.test.ts`

Expected: FAIL — `ConflictDetector` not found.

- [ ] **Step 3: Implement ConflictDetector**

Write `packages/core/src/conflicts.ts`:

```typescript
import type { Skill } from './models/index.js';
import type { ConflictInfo, DiffResult } from './models/conflict.js';

export class ConflictDetector {
  detect(skills: Skill[]): ConflictInfo[] {
    const groups = new Map<string, Skill[]>();

    for (const skill of skills) {
      const existing = groups.get(skill.name) ?? [];
      existing.push(skill);
      groups.set(skill.name, existing);
    }

    const conflicts: ConflictInfo[] = [];
    for (const [name, group] of groups) {
      if (group.length < 2) continue;
      conflicts.push({
        skillName: name,
        instances: group.map((s) => ({
          provider: s.provider,
          path: s.path,
          version: s.version,
        })),
      });
    }

    return conflicts;
  }

  diff(a: Skill, b: Skill): DiffResult {
    const changes: DiffResult['changes'] = [];

    if (a.description !== b.description) {
      changes.push({ field: 'description', a: a.description, b: b.description });
    }
    if (a.version !== b.version) {
      changes.push({ field: 'version', a: a.version ?? '', b: b.version ?? '' });
    }

    return { identical: changes.length === 0, changes };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run tests/conflicts.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): add conflict detector"
```

---

## Task 10: Install Sources (GitHub + skills.sh)

**Files:**
- Create: `packages/core/src/sources/source.ts`
- Create: `packages/core/src/sources/github.ts`
- Create: `packages/core/src/sources/skillssh.ts`
- Create: `packages/core/src/sources/index.ts`

- [ ] **Step 1: Define IInstallSource interface**

Write `packages/core/src/sources/source.ts`:

```typescript
import type { RemoteSkill, UpdateInfo, DownloadResult } from '../models/source.js';
import type { Skill } from '../models/skill.js';

export interface IInstallSource {
  readonly id: string;
  readonly displayName: string;

  search(query: string): Promise<RemoteSkill[]>;
  fetch(identifier: string): Promise<DownloadResult>;
  checkUpdate(skill: Skill): Promise<UpdateInfo | null>;
}
```

- [ ] **Step 2: Implement GitHubSource**

Write `packages/core/src/sources/github.ts`:

```typescript
import type { IInstallSource } from './source.js';
import type { RemoteSkill, UpdateInfo, DownloadResult } from '../models/source.js';
import type { Skill } from '../models/skill.js';
import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ParsedGitHubRef {
  owner: string;
  repo: string;
  ref: string;
  path: string;
}

export function parseGitHubIdentifier(identifier: string): ParsedGitHubRef {
  const urlMatch = identifier.match(
    /github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)/,
  );
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2], ref: urlMatch[3], path: urlMatch[4] };
  }

  // owner/repo@path or owner/repo --path path
  const atMatch = identifier.match(/^([^/]+)\/([^@]+)@(.+)$/);
  if (atMatch) {
    return { owner: atMatch[1], repo: atMatch[2], ref: 'main', path: atMatch[3] };
  }

  const slashMatch = identifier.match(/^([^/]+)\/([^/]+)$/);
  if (slashMatch) {
    return { owner: slashMatch[1], repo: slashMatch[2], ref: 'main', path: '.' };
  }

  throw new Error(`Cannot parse GitHub identifier: ${identifier}`);
}

export class GitHubSource implements IInstallSource {
  readonly id = 'github';
  readonly displayName = 'GitHub';

  async search(_query: string): Promise<RemoteSkill[]> {
    // GitHub doesn't have a skill-specific search API.
    // Return empty — users provide identifiers directly.
    return [];
  }

  async fetch(identifier: string): Promise<DownloadResult> {
    const parsed = parseGitHubIdentifier(identifier);
    const tempDir = await mkdtemp(path.join(tmpdir(), 'skillpack-gh-'));
    const repoUrl = `https://github.com/${parsed.owner}/${parsed.repo}.git`;

    await execFileAsync('git', [
      'clone', '--depth', '1', '--filter=blob:none', '--sparse',
      '--branch', parsed.ref,
      repoUrl, tempDir,
    ]);

    if (parsed.path !== '.') {
      await execFileAsync('git', ['-C', tempDir, 'sparse-checkout', 'set', parsed.path]);
    }

    const skillName = path.basename(parsed.path);
    const skillDir = parsed.path === '.' ? tempDir : path.join(tempDir, parsed.path);

    return {
      tempDir: skillDir,
      skillName,
      files: [],
    };
  }

  async checkUpdate(skill: Skill): Promise<UpdateInfo | null> {
    if (!skill.source?.repo || !skill.source?.commit) return null;

    try {
      const { stdout } = await execFileAsync('git', [
        'ls-remote', `https://github.com/${skill.source.repo}.git`,
        skill.source.ref || 'HEAD',
      ]);
      const latestCommit = stdout.split('\t')[0];

      if (latestCommit && latestCommit !== skill.source.commit) {
        return {
          currentVersion: skill.source.commit.slice(0, 7),
          latestVersion: latestCommit.slice(0, 7),
          hasUpdate: true,
        };
      }
    } catch { /* network error — skip */ }

    return null;
  }
}
```

- [ ] **Step 3: Implement SkillsShSource**

Write `packages/core/src/sources/skillssh.ts`:

```typescript
import type { IInstallSource } from './source.js';
import type { RemoteSkill, UpdateInfo, DownloadResult } from '../models/source.js';
import type { Skill } from '../models/skill.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class SkillsShSource implements IInstallSource {
  readonly id = 'skillssh';
  readonly displayName = 'skills.sh';

  async search(query: string): Promise<RemoteSkill[]> {
    try {
      const { stdout } = await execFileAsync('npx', ['skills', 'find', query, '--json'], {
        timeout: 30_000,
      });
      const results = JSON.parse(stdout);
      return (results as Array<Record<string, unknown>>).map((r) => ({
        name: r.name as string,
        description: (r.description as string) ?? '',
        source: 'skillssh' as const,
        identifier: r.identifier as string,
        installs: r.installs as number | undefined,
      }));
    } catch {
      return [];
    }
  }

  async fetch(identifier: string): Promise<DownloadResult> {
    // Delegate to npx skills add — it handles download and placement
    await execFileAsync('npx', ['skills', 'add', identifier, '-g', '-y'], {
      timeout: 60_000,
    });

    const skillName = identifier.split('@').pop() ?? identifier;
    return {
      tempDir: '',
      skillName,
      files: [],
    };
  }

  async checkUpdate(skill: Skill): Promise<UpdateInfo | null> {
    if (skill.source?.type !== 'skillssh') return null;

    try {
      const { stdout } = await execFileAsync('npx', ['skills', 'check', '--json'], {
        timeout: 30_000,
      });
      const updates = JSON.parse(stdout);
      const match = (updates as Array<Record<string, unknown>>).find(
        (u) => u.name === skill.name,
      );
      if (match) {
        return {
          currentVersion: skill.version,
          latestVersion: match.version as string,
          hasUpdate: true,
        };
      }
    } catch { /* skip */ }

    return null;
  }
}
```

- [ ] **Step 4: Create barrel export**

Write `packages/core/src/sources/index.ts`:

```typescript
export { type IInstallSource } from './source.js';
export { GitHubSource, parseGitHubIdentifier } from './github.js';
export { SkillsShSource } from './skillssh.js';
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): add GitHub and skills.sh install sources"
```

---

## Task 11: SkillManager (Central Coordinator)

**Files:**
- Create: `packages/core/src/manager.ts`
- Create: `packages/core/tests/manager.test.ts`
- Create: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing test**

Write `packages/core/tests/manager.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SkillManager } from '../src/manager.js';
import { CodexProvider } from '../src/providers/codex.js';

describe('SkillManager', () => {
  let dir: string;
  let manager: SkillManager;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'skillpack-mgr-'));
    const provider = new CodexProvider([dir]);
    manager = new SkillManager();
    manager.registerProvider(provider);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('scans all providers', async () => {
    const skillDir = path.join(dir, 'test');
    await mkdir(skillDir);
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: test\ndescription: t\n---\n');

    await manager.scanAll();
    expect(manager.getAllSkills()).toHaveLength(1);
  });

  it('detects conflicts', async () => {
    const dir2 = await mkdtemp(path.join(tmpdir(), 'skillpack-mgr2-'));
    const provider2 = new CodexProvider([dir2]);
    // Hack: override id to simulate a different provider
    (provider2 as any).id = 'other';
    manager.registerProvider(provider2);

    for (const d of [dir, dir2]) {
      const skillDir = path.join(d, 'same-skill');
      await mkdir(skillDir);
      await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: same-skill\ndescription: dup\n---\n');
    }

    await manager.scanAll();
    const conflicts = manager.getConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].skillName).toBe('same-skill');

    await rm(dir2, { recursive: true, force: true });
  });

  it('creates a skill', async () => {
    const skill = await manager.createSkill('codex', { name: 'new', description: 'New skill' });
    expect(skill.name).toBe('new');

    await manager.scanAll();
    expect(manager.getAllSkills()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run tests/manager.test.ts`

Expected: FAIL — `SkillManager` not found.

- [ ] **Step 3: Implement SkillManager**

Write `packages/core/src/manager.ts`:

```typescript
import type { ISkillProvider } from './providers/provider.js';
import type { IInstallSource } from './sources/source.js';
import type { Skill, SkillTemplate } from './models/index.js';
import type { ConflictInfo } from './models/conflict.js';
import type { RemoteSkill, UpdateInfo } from './models/source.js';
import { ConflictDetector } from './conflicts.js';

export class SkillManager {
  private providers = new Map<string, ISkillProvider>();
  private sources = new Map<string, IInstallSource>();
  private skills: Skill[] = [];
  private conflicts: ConflictInfo[] = [];
  private conflictDetector = new ConflictDetector();

  registerProvider(provider: ISkillProvider): void {
    this.providers.set(provider.id, provider);
  }

  registerSource(source: IInstallSource): void {
    this.sources.set(source.id, source);
  }

  getProvider(id: string): ISkillProvider | undefined {
    return this.providers.get(id);
  }

  getProviders(): ISkillProvider[] {
    return [...this.providers.values()];
  }

  getSources(): IInstallSource[] {
    return [...this.sources.values()];
  }

  async scanAll(): Promise<void> {
    const results = await Promise.all(
      [...this.providers.values()].map((p) => p.scan()),
    );
    this.skills = results.flat();
    this.conflicts = this.conflictDetector.detect(this.skills);
  }

  getAllSkills(): Skill[] {
    return this.skills;
  }

  getSkillsByProvider(providerId: string): Skill[] {
    return this.skills.filter((s) => s.provider === providerId);
  }

  getConflicts(): ConflictInfo[] {
    return this.conflicts;
  }

  isConflicting(skillName: string): boolean {
    return this.conflicts.some((c) => c.skillName === skillName);
  }

  async createSkill(providerId: string, template: SkillTemplate): Promise<Skill> {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Provider not found: ${providerId}`);
    if (!provider.capabilities.canCreate) {
      throw new Error(`Provider ${providerId} does not support creating skills`);
    }
    return provider.create(template);
  }

  async uninstallSkill(skill: Skill): Promise<void> {
    const provider = this.providers.get(skill.provider);
    if (!provider) throw new Error(`Provider not found: ${skill.provider}`);
    await provider.uninstall(skill.name);
  }

  async searchRemote(sourceId: string, query: string): Promise<RemoteSkill[]> {
    const source = this.sources.get(sourceId);
    if (!source) throw new Error(`Source not found: ${sourceId}`);
    return source.search(query);
  }

  async installFromSource(sourceId: string, identifier: string, providerId: string): Promise<void> {
    const source = this.sources.get(sourceId);
    if (!source) throw new Error(`Source not found: ${sourceId}`);
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Provider not found: ${providerId}`);

    const result = await source.fetch(identifier);

    // skills.sh handles its own placement — just rescan
    if (sourceId === 'skillssh') {
      await this.scanAll();
      return;
    }

    await provider.install(result.skillName, {
      sourceType: sourceId as 'github' | 'skillssh',
      identifier,
      tempDir: result.tempDir,
    });
    await this.scanAll();
  }

  async checkUpdates(): Promise<Array<{ skill: Skill; update: UpdateInfo }>> {
    const updates: Array<{ skill: Skill; update: UpdateInfo }> = [];
    for (const skill of this.skills) {
      if (!skill.source || skill.source.type === 'local') continue;
      for (const source of this.sources.values()) {
        const update = await source.checkUpdate(skill);
        if (update?.hasUpdate) {
          updates.push({ skill, update });
          break;
        }
      }
    }
    return updates;
  }
}
```

- [ ] **Step 4: Create core barrel export**

Write `packages/core/src/index.ts`:

```typescript
export * from './models/index.js';
export * from './providers/index.js';
export * from './sources/index.js';
export { ConflictDetector } from './conflicts.js';
export { SkillManager } from './manager.js';
export { LockfileManager, type LockEntry } from './lockfile.js';
export { ConfigManager, type SkillpackConfig } from './config.js';
export { parseSkillMd, generateSkillMd } from './parser.js';
```

- [ ] **Step 5: Run all core tests**

Run: `cd packages/core && npx vitest run`

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(core): add SkillManager coordinator and core barrel export"
```

---

## Task 12: TUI — App Shell & Context

**Files:**
- Create: `packages/tui/src/context/app-context.tsx`
- Create: `packages/tui/src/hooks/use-skill-manager.ts`
- Create: `packages/tui/src/app.tsx`
- Create: `packages/tui/bin/skillpack.ts`

- [ ] **Step 1: Create app context**

Write `packages/tui/src/context/app-context.tsx`:

```tsx
import React, { createContext, useContext, useState } from 'react';
import type { SkillManager, Skill, ConflictInfo } from '@skillpack/core';

export type View = 'list' | 'detail' | 'install' | 'create' | 'update';

interface AppState {
  manager: SkillManager;
  skills: Skill[];
  conflicts: ConflictInfo[];
  activeTab: string;
  view: View;
  selectedSkill: Skill | null;
  searchQuery: string;
  loading: boolean;
}

interface AppContextValue extends AppState {
  setActiveTab: (tab: string) => void;
  setView: (view: View) => void;
  setSelectedSkill: (skill: Skill | null) => void;
  setSearchQuery: (query: string) => void;
  refresh: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  manager,
  children,
}: {
  manager: SkillManager;
  children: React.ReactNode;
}) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);
  const [activeTab, setActiveTab] = useState('All');
  const [view, setView] = useState<View>('list');
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    await manager.scanAll();
    setSkills(manager.getAllSkills());
    setConflicts(manager.getConflicts());
    setLoading(false);
  };

  return (
    <AppContext.Provider
      value={{
        manager,
        skills,
        conflicts,
        activeTab,
        view,
        selectedSkill,
        searchQuery,
        loading,
        setActiveTab,
        setView,
        setSelectedSkill,
        setSearchQuery,
        refresh,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
```

- [ ] **Step 2: Create SkillManager initialization hook**

Write `packages/tui/src/hooks/use-skill-manager.ts`:

```typescript
import { useEffect, useState } from 'react';
import {
  SkillManager,
  ConfigManager,
  CodexProvider,
  CursorProvider,
  ClaudeProvider,
  SkillsShProvider,
  GitHubSource,
  SkillsShSource,
} from '@skillpack/core';

export function useSkillManager() {
  const [manager, setManager] = useState<SkillManager | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const config = new ConfigManager();
        const cfg = await config.load();

        const mgr = new SkillManager();

        if (cfg.providers.codex?.enabled) {
          mgr.registerProvider(new CodexProvider(cfg.providers.codex.paths));
        }
        if (cfg.providers.cursor?.enabled) {
          mgr.registerProvider(new CursorProvider(cfg.providers.cursor.paths));
        }
        if (cfg.providers.claude?.enabled) {
          mgr.registerProvider(new ClaudeProvider(cfg.providers.claude.paths));
        }
        if (cfg.providers.skillssh?.enabled) {
          mgr.registerProvider(new SkillsShProvider(cfg.providers.skillssh.paths));
        }

        if (cfg.sources.github?.enabled) mgr.registerSource(new GitHubSource());
        if (cfg.sources.skillssh?.enabled) mgr.registerSource(new SkillsShSource());

        setManager(mgr);
      } catch (err) {
        setError(String(err));
      }
    })();
  }, []);

  return { manager, error };
}
```

- [ ] **Step 3: Create App root component**

Write `packages/tui/src/app.tsx`:

```tsx
import React, { useEffect } from 'react';
import { Box, Text } from 'ink';
import { Spinner } from '@inkjs/ui';
import { AppProvider, useApp } from './context/app-context.js';
import { useSkillManager } from './hooks/use-skill-manager.js';
import { ListView } from './views/list-view.js';
import { DetailView } from './views/detail-view.js';
import { InstallView } from './views/install-view.js';
import { CreateView } from './views/create-view.js';
import { UpdateView } from './views/update-view.js';

function Router() {
  const { view, loading, refresh } = useApp();

  useEffect(() => {
    refresh();
  }, []);

  if (loading) {
    return (
      <Box justifyContent="center" padding={1}>
        <Spinner label="Scanning skills..." />
      </Box>
    );
  }

  switch (view) {
    case 'list': return <ListView />;
    case 'detail': return <DetailView />;
    case 'install': return <InstallView />;
    case 'create': return <CreateView />;
    case 'update': return <UpdateView />;
  }
}

export function App() {
  const { manager, error } = useSkillManager();

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  if (!manager) {
    return <Spinner label="Initializing..." />;
  }

  return (
    <AppProvider manager={manager}>
      <Router />
    </AppProvider>
  );
}
```

Note: The view components (`ListView`, `DetailView`, etc.) will be implemented in the following tasks. Create placeholder files that export empty components first, then fill them in.

- [ ] **Step 4: Create CLI entry point**

Write `packages/tui/bin/skillpack.ts`:

```typescript
#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from '../src/app.js';

render(React.createElement(App));
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(tui): add app shell, context, and CLI entry point"
```

---

## Task 13: TUI — Tab Bar & Status Bar Components

**Files:**
- Create: `packages/tui/src/components/tab-bar.tsx`
- Create: `packages/tui/src/components/status-bar.tsx`
- Create: `packages/tui/src/components/skill-row.tsx`

- [ ] **Step 1: Create TabBar**

Write `packages/tui/src/components/tab-bar.tsx`:

```tsx
import React from 'react';
import { Box, Text } from 'ink';

interface TabBarProps {
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function TabBar({ tabs, activeTab }: TabBarProps) {
  return (
    <Box flexDirection="row" gap={1} paddingX={1}>
      {tabs.map((tab) => (
        <Text
          key={tab}
          bold={tab === activeTab}
          color={tab === activeTab ? 'cyan' : 'gray'}
        >
          {tab === activeTab ? `[${tab}]` : ` ${tab} `}
        </Text>
      ))}
    </Box>
  );
}
```

- [ ] **Step 2: Create StatusBar**

Write `packages/tui/src/components/status-bar.tsx`:

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import { useApp } from '../context/app-context.js';

export function StatusBar() {
  const { view } = useApp();

  const keys =
    view === 'detail'
      ? 'e edit  d delete  u update  f fork  Esc back'
      : '↑↓/jk navigate  Tab group  / search  i install  c create  d delete  u update  q quit';

  return (
    <Box borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} paddingX={1}>
      <Text dimColor>{keys}</Text>
    </Box>
  );
}
```

- [ ] **Step 3: Create SkillRow**

Write `packages/tui/src/components/skill-row.tsx`:

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { Skill } from '@skillpack/core';

interface SkillRowProps {
  skill: Skill;
  isSelected: boolean;
  isConflicting: boolean;
}

export function SkillRow({ skill, isSelected, isConflicting }: SkillRowProps) {
  return (
    <Box gap={1}>
      <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
        {isSelected ? '▸' : ' '}
      </Text>
      <Text color={isSelected ? 'white' : undefined} bold={isSelected}>
        {skill.name.padEnd(24)}
      </Text>
      <Text dimColor>{skill.provider.padEnd(12)}</Text>
      <Text color={skill.enabled ? 'green' : 'yellow'}>
        {skill.enabled ? 'installed' : 'disabled'}
      </Text>
      {skill.readonly && <Text dimColor> ro</Text>}
      {isConflicting && <Text color="yellow"> ⚠</Text>}
    </Box>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(tui): add tab bar, status bar, and skill row components"
```

---

## Task 14: TUI — List View with Navigation & Search

**Files:**
- Create: `packages/tui/src/views/list-view.tsx`
- Create: `packages/tui/src/hooks/use-skills.ts`
- Create: `packages/tui/src/hooks/use-search.ts`
- Create: `packages/tui/src/components/search-input.tsx`

- [ ] **Step 1: Create search hook**

Write `packages/tui/src/hooks/use-search.ts`:

```typescript
import { useMemo } from 'react';
import Fuse from 'fuse.js';
import type { Skill } from '@skillpack/core';

export function useSearch(skills: Skill[], query: string): Skill[] {
  const fuse = useMemo(
    () => new Fuse(skills, { keys: ['name', 'description'], threshold: 0.4 }),
    [skills],
  );

  if (!query) return skills;
  return fuse.search(query).map((r) => r.item);
}
```

- [ ] **Step 2: Create skills filtering hook**

Write `packages/tui/src/hooks/use-skills.ts`:

```typescript
import { useMemo } from 'react';
import type { Skill } from '@skillpack/core';
import { useApp } from '../context/app-context.js';
import { useSearch } from './use-search.js';

export function useFilteredSkills(): Skill[] {
  const { skills, activeTab, searchQuery } = useApp();

  const tabFiltered = useMemo(() => {
    if (activeTab === 'All') return skills;
    const tabToProvider: Record<string, string> = {
      Codex: 'codex',
      Cursor: 'cursor',
      'skills.sh': 'skillssh',
      Claude: 'claude',
      Project: 'project',
    };
    const providerId = tabToProvider[activeTab];
    if (!providerId) return skills;
    if (providerId === 'project') return skills.filter((s) => s.scope === 'project');
    return skills.filter((s) => s.provider === providerId);
  }, [skills, activeTab]);

  return useSearch(tabFiltered, searchQuery);
}
```

- [ ] **Step 3: Create SearchInput component**

Write `packages/tui/src/components/search-input.tsx`:

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import { TextInput } from '@inkjs/ui';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function SearchInput({ value, onChange, onSubmit }: SearchInputProps) {
  return (
    <Box gap={1} paddingX={1}>
      <Text color="cyan">/</Text>
      <TextInput
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder="Search skills..."
      />
    </Box>
  );
}
```

- [ ] **Step 4: Create ListView**

Write `packages/tui/src/views/list-view.tsx`:

```tsx
import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { useApp } from '../context/app-context.js';
import { useFilteredSkills } from '../hooks/use-skills.js';
import { TabBar } from '../components/tab-bar.js';
import { SkillRow } from '../components/skill-row.js';
import { StatusBar } from '../components/status-bar.js';
import { SearchInput } from '../components/search-input.js';

const TABS = ['All', 'Codex', 'Cursor', 'skills.sh', 'Claude', 'Project'];

export function ListView() {
  const app = useApp();
  const skills = useFilteredSkills();
  const [cursor, setCursor] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');

  const handleTabChange = useCallback(
    (direction: number) => {
      const idx = TABS.indexOf(app.activeTab);
      const next = (idx + direction + TABS.length) % TABS.length;
      app.setActiveTab(TABS[next]);
      setCursor(0);
    },
    [app.activeTab],
  );

  useInput((input, key) => {
    if (searching) {
      if (key.escape) {
        setSearching(false);
        app.setSearchQuery('');
        setSearchDraft('');
      }
      return;
    }

    if (input === '/' || input === 's') {
      setSearching(true);
      return;
    }

    if (key.upArrow || input === 'k') {
      setCursor((c) => Math.max(0, c - 1));
    } else if (key.downArrow || input === 'j') {
      setCursor((c) => Math.min(skills.length - 1, c + 1));
    } else if (key.tab) {
      handleTabChange(key.shift ? -1 : 1);
    } else if (key.return && skills[cursor]) {
      app.setSelectedSkill(skills[cursor]);
      app.setView('detail');
    } else if (input === 'i') {
      app.setView('install');
    } else if (input === 'c') {
      app.setView('create');
    } else if (input === 'q') {
      process.exit(0);
    }
  });

  return (
    <Box flexDirection="column">
      <Box paddingX={1} justifyContent="space-between">
        <Text bold color="cyan">skillpack</Text>
        <Text dimColor>? help</Text>
      </Box>

      <TabBar tabs={TABS} activeTab={app.activeTab} onTabChange={app.setActiveTab} />

      {searching && (
        <SearchInput
          value={searchDraft}
          onChange={(v) => {
            setSearchDraft(v);
            app.setSearchQuery(v);
          }}
          onSubmit={() => setSearching(false)}
        />
      )}

      <Box flexDirection="column" paddingX={1} minHeight={10}>
        {skills.length === 0 ? (
          <Text dimColor>No skills found.</Text>
        ) : (
          skills.map((skill, i) => (
            <SkillRow
              key={`${skill.provider}:${skill.name}`}
              skill={skill}
              isSelected={i === cursor}
              isConflicting={app.conflicts.some((c) => c.skillName === skill.name)}
            />
          ))
        )}
      </Box>

      <StatusBar />
    </Box>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(tui): add list view with tab navigation, search, and keyboard shortcuts"
```

---

## Task 15: TUI — Detail View

**Files:**
- Create: `packages/tui/src/views/detail-view.tsx`

- [ ] **Step 1: Implement DetailView**

Write `packages/tui/src/views/detail-view.tsx`:

```tsx
import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useApp } from '../context/app-context.js';
import { StatusBar } from '../components/status-bar.js';
import { execSync } from 'node:child_process';

export function DetailView() {
  const { selectedSkill, setView, manager, refresh, conflicts } = useApp();

  if (!selectedSkill) {
    setView('list');
    return null;
  }

  const conflict = conflicts.find((c) => c.skillName === selectedSkill.name);

  useInput((input, key) => {
    if (key.escape) {
      setView('list');
    } else if (input === 'e' && !selectedSkill.readonly) {
      const editor = process.env.EDITOR || 'vi';
      const skillMdPath = `${selectedSkill.path}/SKILL.md`;
      try {
        execSync(`${editor} "${skillMdPath}"`, { stdio: 'inherit' });
        refresh();
      } catch { /* user cancelled */ }
    } else if (input === 'E' && !selectedSkill.readonly) {
      const editor = process.env.EDITOR || 'vi';
      const skillMdPath = `${selectedSkill.path}/SKILL.md`;
      try {
        execSync(`${editor} "${skillMdPath}"`, { stdio: 'inherit' });
        refresh();
      } catch { /* user cancelled */ }
    } else if (input === 'd') {
      manager.uninstallSkill(selectedSkill).then(() => {
        refresh();
        setView('list');
      });
    }
  });

  return (
    <Box flexDirection="column">
      <Box paddingX={1} gap={2}>
        <Text dimColor>← Back</Text>
        <Text bold color="magenta">{selectedSkill.name}</Text>
      </Box>

      <Box flexDirection="column" paddingX={2} paddingY={1} gap={0}>
        <Text>Platform:  <Text color="cyan">{selectedSkill.provider}</Text></Text>
        <Text>Path:      <Text dimColor>{selectedSkill.path}</Text></Text>
        {selectedSkill.version && <Text>Version:   {selectedSkill.version}</Text>}
        <Text>Source:    {selectedSkill.source?.type ?? 'unknown'}{selectedSkill.source?.repo ? ` (${selectedSkill.source.repo})` : ''}</Text>
        <Text>Status:    <Text color={selectedSkill.enabled ? 'green' : 'yellow'}>{selectedSkill.enabled ? 'enabled' : 'disabled'}</Text></Text>
        <Text>Editable:  <Text color={selectedSkill.readonly ? 'yellow' : 'green'}>{selectedSkill.readonly ? 'read-only' : 'yes'}</Text></Text>
        {conflict && (
          <Text color="yellow">⚠ Conflict: also exists in {conflict.instances.filter(i => i.provider !== selectedSkill.provider).map(i => i.provider).join(', ')}</Text>
        )}
      </Box>

      <Box flexDirection="column" paddingX={2} borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false}>
        <Text>{selectedSkill.description}</Text>
      </Box>

      <StatusBar />
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(tui): add skill detail view with edit and delete actions"
```

---

## Task 16: TUI — Install View

**Files:**
- Create: `packages/tui/src/views/install-view.tsx`

- [ ] **Step 1: Implement InstallView (multi-step wizard)**

Write `packages/tui/src/views/install-view.tsx`:

```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput, Spinner } from '@inkjs/ui';
import { useApp } from '../context/app-context.js';
import type { RemoteSkill } from '@skillpack/core';

type Step = 'source' | 'query' | 'results' | 'provider' | 'installing';

export function InstallView() {
  const { manager, setView, refresh } = useApp();
  const [step, setStep] = useState<Step>('source');
  const [sourceId, setSourceId] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RemoteSkill[]>([]);
  const [selectedResult, setSelectedResult] = useState(0);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState('');

  const sources = manager.getSources();
  const providers = manager.getProviders().filter((p) => p.capabilities.canInstall);

  useInput((input, key) => {
    if (key.escape) {
      if (step === 'source') {
        setView('list');
      } else {
        setStep('source');
      }
    }

    if (step === 'source') {
      if (input === '1' && sources.length >= 1) {
        setSourceId(sources[0].id);
        setStep('query');
      } else if (input === '2' && sources.length >= 2) {
        setSourceId(sources[1].id);
        setStep('query');
      }
    }

    if (step === 'results') {
      if (key.upArrow) setSelectedResult((c) => Math.max(0, c - 1));
      if (key.downArrow) setSelectedResult((c) => Math.min(results.length - 1, c + 1));
      if (key.return && results[selectedResult]) {
        setStep('provider');
      }
    }

    if (step === 'provider') {
      const idx = parseInt(input) - 1;
      if (idx >= 0 && idx < providers.length) {
        setInstalling(true);
        setStep('installing');
        const result = results[selectedResult];
        manager
          .installFromSource(sourceId, result.identifier, providers[idx].id)
          .then(() => refresh())
          .then(() => setView('list'))
          .catch((err) => {
            setError(String(err));
            setInstalling(false);
          });
      }
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Install Skill</Text>

      {step === 'source' && (
        <Box flexDirection="column" marginTop={1}>
          <Text>Select source:</Text>
          {sources.map((s, i) => (
            <Text key={s.id}> {i + 1}) {s.displayName}</Text>
          ))}
          <Text dimColor marginTop={1}>Esc to cancel</Text>
        </Box>
      )}

      {step === 'query' && (
        <Box flexDirection="column" marginTop={1}>
          <Text>Enter search query or identifier:</Text>
          <TextInput
            value={query}
            onChange={setQuery}
            onSubmit={async () => {
              const res = await manager.searchRemote(sourceId, query);
              if (sourceId === 'github' && res.length === 0) {
                // Treat query as direct identifier for GitHub
                setResults([{
                  name: query.split('/').pop()?.split('@').pop() ?? query,
                  description: 'Direct install from GitHub',
                  source: 'github',
                  identifier: query,
                }]);
              } else {
                setResults(res);
              }
              setStep('results');
            }}
            placeholder="e.g. gsap or owner/repo@skill-name"
          />
        </Box>
      )}

      {step === 'results' && (
        <Box flexDirection="column" marginTop={1}>
          <Text>Results ({results.length}):</Text>
          {results.map((r, i) => (
            <Text key={r.identifier} color={i === selectedResult ? 'cyan' : undefined}>
              {i === selectedResult ? '▸' : ' '} {r.name} — {r.description}
            </Text>
          ))}
          <Text dimColor marginTop={1}>Enter to select, Esc to go back</Text>
        </Box>
      )}

      {step === 'provider' && (
        <Box flexDirection="column" marginTop={1}>
          <Text>Install to which platform?</Text>
          {providers.map((p, i) => (
            <Text key={p.id}> {i + 1}) {p.displayName}</Text>
          ))}
        </Box>
      )}

      {step === 'installing' && (
        <Box marginTop={1}>
          <Spinner label="Installing..." />
        </Box>
      )}

      {error && <Text color="red" marginTop={1}>{error}</Text>}
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(tui): add install wizard with source selection and search"
```

---

## Task 17: TUI — Create View

**Files:**
- Create: `packages/tui/src/views/create-view.tsx`

- [ ] **Step 1: Implement CreateView**

Write `packages/tui/src/views/create-view.tsx`:

```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput } from '@inkjs/ui';
import { useApp } from '../context/app-context.js';
import { execSync } from 'node:child_process';

type Step = 'provider' | 'name' | 'description' | 'creating';

export function CreateView() {
  const { manager, setView, refresh } = useApp();
  const [step, setStep] = useState<Step>('provider');
  const [providerId, setProviderId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const providers = manager.getProviders().filter((p) => p.capabilities.canCreate);

  useInput((input, key) => {
    if (key.escape) {
      setView('list');
      return;
    }

    if (step === 'provider') {
      const idx = parseInt(input) - 1;
      if (idx >= 0 && idx < providers.length) {
        setProviderId(providers[idx].id);
        setStep('name');
      }
    }
  });

  const handleNameSubmit = () => {
    if (!name.trim()) {
      setError('Name cannot be empty');
      return;
    }
    setError('');
    setStep('description');
  };

  const handleDescriptionSubmit = async () => {
    setStep('creating');
    try {
      const skill = await manager.createSkill(providerId, {
        name: name.trim(),
        description: description.trim(),
      });

      const editor = process.env.EDITOR || 'vi';
      try {
        execSync(`${editor} "${skill.path}/SKILL.md"`, { stdio: 'inherit' });
      } catch { /* user cancelled editor */ }

      await refresh();
      setView('list');
    } catch (err) {
      setError(String(err));
      setStep('provider');
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Create New Skill</Text>

      {step === 'provider' && (
        <Box flexDirection="column" marginTop={1}>
          <Text>Select target platform:</Text>
          {providers.map((p, i) => (
            <Text key={p.id}> {i + 1}) {p.displayName}</Text>
          ))}
          <Text dimColor marginTop={1}>Esc to cancel</Text>
        </Box>
      )}

      {step === 'name' && (
        <Box flexDirection="column" marginTop={1}>
          <Text>Skill name (kebab-case):</Text>
          <TextInput value={name} onChange={setName} onSubmit={handleNameSubmit} placeholder="my-skill" />
        </Box>
      )}

      {step === 'description' && (
        <Box flexDirection="column" marginTop={1}>
          <Text>Short description:</Text>
          <TextInput value={description} onChange={setDescription} onSubmit={handleDescriptionSubmit} placeholder="What does this skill do?" />
        </Box>
      )}

      {step === 'creating' && <Text dimColor marginTop={1}>Creating skill and opening editor...</Text>}

      {error && <Text color="red" marginTop={1}>{error}</Text>}
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(tui): add create skill wizard with editor integration"
```

---

## Task 18: TUI — Update View & Placeholder Views

**Files:**
- Create: `packages/tui/src/views/update-view.tsx`
- Create: `packages/tui/src/components/confirm-dialog.tsx`

- [ ] **Step 1: Create ConfirmDialog**

Write `packages/tui/src/components/confirm-dialog.tsx`:

```tsx
import React from 'react';
import { Box, Text, useInput } from 'ink';

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  useInput((input) => {
    if (input === 'y' || input === 'Y') onConfirm();
    if (input === 'n' || input === 'N' || input === 'q') onCancel();
  });

  return (
    <Box gap={1}>
      <Text color="yellow">{message}</Text>
      <Text dimColor>(y/n)</Text>
    </Box>
  );
}
```

- [ ] **Step 2: Implement UpdateView**

Write `packages/tui/src/views/update-view.tsx`:

```tsx
import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { Spinner } from '@inkjs/ui';
import { useApp } from '../context/app-context.js';
import type { Skill, UpdateInfo } from '@skillpack/core';

export function UpdateView() {
  const { manager, setView, refresh } = useApp();
  const [checking, setChecking] = useState(true);
  const [updates, setUpdates] = useState<Array<{ skill: Skill; update: UpdateInfo }>>([]);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    manager.checkUpdates().then((u) => {
      setUpdates(u);
      setChecking(false);
    });
  }, []);

  useInput((input, key) => {
    if (key.escape) setView('list');
    if (checking) return;

    if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
    if (key.downArrow) setCursor((c) => Math.min(updates.length - 1, c + 1));
  });

  if (checking) {
    return (
      <Box padding={1}>
        <Spinner label="Checking for updates..." />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Available Updates ({updates.length})</Text>

      {updates.length === 0 ? (
        <Text dimColor marginTop={1}>All skills are up to date.</Text>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {updates.map(({ skill, update }, i) => (
            <Text key={skill.name} color={i === cursor ? 'cyan' : undefined}>
              {i === cursor ? '▸' : ' '} {skill.name}: {update.currentVersion} → {update.latestVersion}
            </Text>
          ))}
        </Box>
      )}

      <Text dimColor marginTop={1}>Esc to go back</Text>
    </Box>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(tui): add update view and confirm dialog"
```

---

## Task 19: Fork to Local & Lock File Wiring

**Files:**
- Modify: `packages/core/src/manager.ts`
- Modify: `packages/tui/src/views/detail-view.tsx`

- [ ] **Step 1: Add forkToLocal to SkillManager**

In `packages/core/src/manager.ts`, add:

```typescript
async forkToLocal(skill: Skill, targetProviderId: string): Promise<Skill> {
  const provider = this.providers.get(targetProviderId);
  if (!provider) throw new Error(`Provider not found: ${targetProviderId}`);
  if (!provider.capabilities.canCreate) {
    throw new Error(`Provider ${targetProviderId} does not support creating skills`);
  }

  const destDir = path.join(provider.basePaths[0], skill.name);
  await cp(skill.path, destDir, { recursive: true });

  return {
    ...skill,
    provider: targetProviderId,
    path: destDir,
    readonly: false,
    source: {
      type: 'local',
      createdAt: new Date().toISOString(),
      forkedFrom: skill.source?.type !== 'local'
        ? { source: skill.source!.type as 'github' | 'skillssh', identifier: skill.source!.repo ?? skill.name }
        : undefined,
    },
  };
}
```

Add the `cp` import from `node:fs/promises` at the top.

- [ ] **Step 2: Add fork keybinding to DetailView**

In `packages/tui/src/views/detail-view.tsx`, add handling for `f` key:

```typescript
} else if (input === 'f' && selectedSkill.readonly) {
  // Fork to local — pick first writable provider
  const writableProviders = manager.getProviders().filter(p => p.capabilities.canCreate);
  if (writableProviders.length > 0) {
    manager.forkToLocal(selectedSkill, writableProviders[0].id).then(() => {
      refresh();
      setView('list');
    });
  }
}
```

- [ ] **Step 3: Wire LockfileManager into install flow**

In `packages/core/src/manager.ts`, add a `lockfile` property initialized in a new `init()` method. After each `installFromSource` call, write the installed skill's info to the lock file:

```typescript
private globalLock?: LockfileManager;

async init(configDir?: string): Promise<void> {
  const lockPath = path.join(configDir ?? path.join(os.homedir(), '.config', 'skillpack'), 'skillpack.lock');
  this.globalLock = new LockfileManager(lockPath);
  await this.globalLock.load();
}

// In installFromSource, after successful install:
if (this.globalLock) {
  this.globalLock.setEntry(result.skillName, {
    source: sourceId,
    identifier,
    installedAt: new Date().toISOString(),
    integrity: '',  // TODO: compute hash in a follow-up
  });
  await this.globalLock.save();
}
```

Add the required imports (`os`, `LockfileManager`) at the top.

- [ ] **Step 4: Run tests**

Run: `cd packages/core && npx vitest run`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add fork-to-local, wire lock file into install flow"
```

---

## Task 20: Integration — Build, Link & Smoke Test

**Files:**
- Modify: `packages/tui/src/app.tsx` (ensure all views are imported correctly)

- [ ] **Step 1: Verify core builds**

Run: `cd packages/core && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 2: Verify tui builds**

Run: `cd packages/tui && npx tsc --noEmit`

Expected: No errors. Fix any import issues.

- [ ] **Step 3: Run all core tests**

Run: `cd packages/core && npx vitest run`

Expected: All tests PASS.

- [ ] **Step 4: Build both packages**

Run: `npm run build`

Expected: Successful build, `dist/` created in both packages.

- [ ] **Step 5: Test CLI launch**

Run: `node packages/tui/dist/bin/skillpack.js`

Expected: TUI launches, scans skills from local directories, displays tab bar and skill list. Press `q` to quit.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: verify build and integration smoke test"
```

---

## Task 21: Project-Level Skill Scanning with Override Priority

**Files:**
- Modify: `packages/core/src/manager.ts`
- Modify: `packages/tui/src/hooks/use-skill-manager.ts`
- Modify: `packages/tui/src/context/app-context.tsx`

- [ ] **Step 1: Add project-level scanning to SkillManager**

In `packages/core/src/manager.ts`, add a method to scan the current working directory for project-level skills:

```typescript
async scanProjectSkills(cwd: string, projectSkillsDir: string): Promise<Skill[]> {
  const projectPath = path.join(cwd, projectSkillsDir);
  try {
    await access(projectPath);
  } catch {
    return [];
  }
  const entries = await readdir(projectPath, { withFileTypes: true });
  const skills: Skill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const skillDir = path.join(projectPath, entry.name);
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    try {
      const content = await readFile(skillMdPath, 'utf-8');
      const parsed = parseSkillMd(content);
      skills.push({
        name: parsed.name || entry.name,
        description: parsed.description,
        provider: 'project',
        path: skillDir,
        version: parsed.raw.version as string | undefined,
        enabled: true,
        scope: 'project',
        readonly: false,
        metadata: {
          license: parsed.metadata.license,
          author: parsed.metadata.author,
          tags: parsed.metadata.tags,
        },
        source: { type: 'local', createdAt: undefined },
      });
    } catch { /* skip */ }
  }
  return skills;
}
```

Add the required imports (`access`, `readdir`, `readFile`, `path`, `parseSkillMd`) at the top of the file.

Update `scanAll()` to accept optional `cwd` and `projectSkillsDir` parameters, merge project skills, and handle override priority (project skills shadow global skills with the same name):

```typescript
async scanAll(cwd?: string, projectSkillsDir?: string): Promise<void> {
  const results = await Promise.all(
    [...this.providers.values()].map((p) => p.scan()),
  );
  let allSkills = results.flat();

  if (cwd && projectSkillsDir) {
    const projectSkills = await this.scanProjectSkills(cwd, projectSkillsDir);
    const projectNames = new Set(projectSkills.map((s) => s.name));
    // Project skills override global skills with the same name
    allSkills = allSkills.filter((s) => !projectNames.has(s.name));
    allSkills = [...allSkills, ...projectSkills];
  }

  this.skills = allSkills;
  this.conflicts = this.conflictDetector.detect(this.skills);
}
```

- [ ] **Step 2: Pass cwd to refresh in TUI**

Update `packages/tui/src/context/app-context.tsx` so `refresh()` passes `process.cwd()` and the configured `projectSkillsDir` to `scanAll()`. Store the config in context or pass it as a prop to `AppProvider`.

- [ ] **Step 3: Run tests**

Run: `cd packages/core && npx vitest run`

Expected: All tests PASS (existing tests don't pass cwd, so project scanning is skipped).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add project-level skill scanning from cwd"
```

---

## Task 22: README & Package Finalization

**Files:**
- Create: `README.md`
- Modify: `package.json` (ensure scripts are correct)

- [ ] **Step 1: Write README.md**

Write `README.md` with:
- Project description
- Installation instructions (`npm install -g @skillpack/tui`)
- Quick start (run `skillpack` in terminal)
- Keyboard shortcuts reference
- Configuration guide
- How to add a new provider

- [ ] **Step 2: Final build and test**

Run: `npm run build && npm test`

Expected: Build succeeds, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: add README with installation and usage guide"
```
