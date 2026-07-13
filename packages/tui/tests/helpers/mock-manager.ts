import { vi } from 'vitest';
import type {
  DuplicateInfo,
  RemoteSkill,
  ScanPathDiagnostic,
  Skill,
  SkillGroup,
  SkillInventoryInstance,
  SkillManager,
  UpdateInfo,
  SkillUsageOverview,
} from '@skillpack/core';
import { basicInventory, skillsFromInventory } from '../fixtures/inventory.js';

export type MockSkillManager = SkillManager & {
  getAllSkills: ReturnType<typeof vi.fn>;
  getInventory: ReturnType<typeof vi.fn>;
  getProjectSkills: ReturnType<typeof vi.fn>;
  getScanPathDiagnostics: ReturnType<typeof vi.fn>;
  getDuplicates: ReturnType<typeof vi.fn>;
  scanAll: ReturnType<typeof vi.fn>;
  toggleInventoryInstance: ReturnType<typeof vi.fn>;
  uninstallSkill: ReturnType<typeof vi.fn>;
  updateSkill: ReturnType<typeof vi.fn>;
  checkSkillUpdate: ReturnType<typeof vi.fn>;
  checkUpdates: ReturnType<typeof vi.fn>;
  searchRemote: ReturnType<typeof vi.fn>;
  installFromSource: ReturnType<typeof vi.fn>;
  importSkillUsage: ReturnType<typeof vi.fn>;
  resetSkillUsage: ReturnType<typeof vi.fn>;
  getSkillUsageOverview: ReturnType<typeof vi.fn>;
};

export interface MockSkillManagerOptions {
  inventory?: SkillGroup[];
  skills?: Skill[];
  projectSkills?: SkillInventoryInstance[];
  scanPaths?: ScanPathDiagnostic[];
  duplicates?: DuplicateInfo[];
  remoteResults?: RemoteSkill[];
  updateInfo?: UpdateInfo | null;
  updates?: Array<{ skill: Skill; update: UpdateInfo }>;
  usageOverview?: SkillUsageOverview;
}

export function createMockManager(options: MockSkillManagerOptions = {}): MockSkillManager {
  const inventory = options.inventory ?? basicInventory();
  const skills = options.skills ?? skillsFromInventory(inventory);
  const projectSkills = options.projectSkills ?? [];
  const scanPaths = options.scanPaths ?? [];
  const duplicates = options.duplicates ?? [];
  const remoteResults = options.remoteResults ?? [];
  const updates = options.updates ?? [];
  const updateInfo = options.updateInfo ?? { hasUpdate: false };
  const usageOverview = options.usageOverview ?? {
    range: { days: 30, from: '2026-06-08', to: '2026-07-07' },
    providers: [
      {
        provider: 'codex',
        displayName: 'Codex',
        coverageState: 'unsupported',
        coverageReasons: [],
        heatmap: [],
        dailySkillUsage: [],
        ranking: [],
        diagnostics: [],
      },
      {
        provider: 'claude',
        displayName: 'Claude',
        coverageState: 'unsupported',
        coverageReasons: [],
        heatmap: [],
        dailySkillUsage: [],
        ranking: [],
        diagnostics: [],
      },
    ],
  };

  return {
    getAllSkills: vi.fn(() => skills),
    getInventory: vi.fn(() => inventory),
    getProjectSkills: vi.fn(() => projectSkills),
    getScanPathDiagnostics: vi.fn(() => scanPaths),
    getDuplicates: vi.fn(() => duplicates),
    scanAll: vi.fn(async () => {}),
    toggleInventoryInstance: vi.fn(async () => {}),
    uninstallSkill: vi.fn(async () => {}),
    updateSkill: vi.fn(async () => {}),
    checkSkillUpdate: vi.fn(async () => updateInfo),
    checkUpdates: vi.fn(async () => updates),
    searchRemote: vi.fn(async () => remoteResults),
    installFromSource: vi.fn(async () => {}),
    importSkillUsage: vi.fn(async () => []),
    resetSkillUsage: vi.fn(async () => {}),
    getSkillUsageOverview: vi.fn(async () => usageOverview),
  } as unknown as MockSkillManager;
}
