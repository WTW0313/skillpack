import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type {
  SkillManager,
  Skill,
  DuplicateInfo,
  SkillGroup,
  SkillInventoryInstance,
  SkillpackConfig,
  ScanPathDiagnostic,
} from '@skillpack/core';

export type ViewType = 'list' | 'detail' | 'install' | 'project' | 'settings' | 'updates' | 'usage';

interface AppState {
  manager: SkillManager;
  config: SkillpackConfig;
  skills: Skill[];
  inventory: SkillGroup[];
  projectSkills: SkillInventoryInstance[];
  scanPaths: ScanPathDiagnostic[];
  duplicates: DuplicateInfo[];
  activeTab: string;
  view: ViewType;
  selectedGroup: SkillGroup | null;
  selectedSkill: SkillInventoryInstance | null;
  searchQuery: string;
  loading: boolean;
  usageImporting: boolean;
  usageImportError: string | null;
  usageImportRevision: number;
}

interface AppContextValue extends AppState {
  setActiveTab: (tab: string) => void;
  setView: (view: ViewType) => void;
  setSelectedGroup: (group: SkillGroup | null) => void;
  setSelectedSkill: (skill: SkillInventoryInstance | null) => void;
  setSearchQuery: (query: string) => void;
  setLoading: (loading: boolean) => void;
  setUsageImportConsent: (importConsent: boolean) => Promise<void>;
  importSkillUsage: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}

interface AppProviderProps {
  manager: SkillManager;
  config: SkillpackConfig;
  onUsageImportConsentChange?: (importConsent: boolean) => Promise<SkillpackConfig>;
  children: ReactNode;
}

export function AppProvider({ manager, config, onUsageImportConsentChange, children }: AppProviderProps) {
  const [currentConfig, setCurrentConfig] = useState<SkillpackConfig>(config);
  const [skills, setSkills] = useState<Skill[]>(manager.getAllSkills());
  const [inventory, setInventory] = useState<SkillGroup[]>(manager.getInventory());
  const [projectSkills, setProjectSkills] = useState<SkillInventoryInstance[]>(manager.getProjectSkills());
  const [scanPaths, setScanPaths] = useState<ScanPathDiagnostic[]>(manager.getScanPathDiagnostics());
  const [duplicates, setDuplicates] = useState<DuplicateInfo[]>(manager.getDuplicates());
  const [activeTab, setActiveTab] = useState('All');
  const [view, setView] = useState<ViewType>('list');
  const [selectedGroup, setSelectedGroup] = useState<SkillGroup | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillInventoryInstance | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [usageImporting, setUsageImporting] = useState(false);
  const [usageImportError, setUsageImportError] = useState<string | null>(null);
  const [usageImportRevision, setUsageImportRevision] = useState(0);

  const setUsageImportConsent = useCallback(
    async (importConsent: boolean) => {
      const nextConfig = onUsageImportConsentChange
        ? await onUsageImportConsentChange(importConsent)
        : {
            ...currentConfig,
            usage: {
              ...currentConfig.usage,
              importConsent,
            },
          };
      setCurrentConfig(nextConfig);
    },
    [currentConfig, onUsageImportConsentChange],
  );

  const importSkillUsage = useCallback(async () => {
    setUsageImporting(true);
    setUsageImportError(null);
    try {
      await manager.importSkillUsage();
      setUsageImportRevision((value) => value + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setUsageImportError(message);
      throw err;
    } finally {
      setUsageImporting(false);
    }
  }, [manager]);

  useEffect(() => {
    if (!currentConfig.usage.importConsent) return;
    importSkillUsage().catch((err) => {
      setUsageImportError(err instanceof Error ? err.message : String(err));
    });
  }, [currentConfig.usage.importConsent, importSkillUsage]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await manager.scanAll(process.cwd(), currentConfig.projectSkillsDirs);
    const newSkills = manager.getAllSkills();
    const newInventory = manager.getInventory();
    setSkills(newSkills);
    setInventory(newInventory);
    setProjectSkills(manager.getProjectSkills());
    setScanPaths(manager.getScanPathDiagnostics());
    setDuplicates(manager.getDuplicates());
    setSelectedGroup((prev) => {
      if (!prev) return null;
      return newInventory.find((group) => group.id === prev.id) ?? null;
    });
    setSelectedSkill((prev) => {
      if (!prev) return null;
      const nextGroup = newInventory.find((group) =>
        group.instances.some((instance) => instance.provider === prev.provider && instance.path === prev.path),
      );
      const nextInstance = nextGroup?.instances.find(
        (instance) => instance.provider === prev.provider && instance.path === prev.path,
      );
      return nextInstance ?? nextGroup?.instances[0] ?? null;
    });
    setLoading(false);
  }, [manager, currentConfig]);

  return (
    <AppContext.Provider
      value={{
        manager,
        config: currentConfig,
        skills,
        inventory,
        projectSkills,
        scanPaths,
        duplicates,
        activeTab,
        view,
        selectedGroup,
        selectedSkill,
        searchQuery,
        loading,
        usageImporting,
        usageImportError,
        usageImportRevision,
        setActiveTab,
        setView,
        setSelectedGroup,
        setSelectedSkill,
        setSearchQuery,
        setLoading,
        setUsageImportConsent,
        importSkillUsage,
        refresh,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
