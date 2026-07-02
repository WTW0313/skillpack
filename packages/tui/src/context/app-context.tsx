import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type {
  SkillManager,
  Skill,
  DuplicateInfo,
  SkillGroup,
  SkillInventoryInstance,
  SkillpackConfig,
  ScanPathDiagnostic,
} from '@skillpack/core';

export type ViewType = 'list' | 'detail' | 'install' | 'project' | 'settings' | 'updates';

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
}

interface AppContextValue extends AppState {
  setActiveTab: (tab: string) => void;
  setView: (view: ViewType) => void;
  setSelectedGroup: (group: SkillGroup | null) => void;
  setSelectedSkill: (skill: SkillInventoryInstance | null) => void;
  setSearchQuery: (query: string) => void;
  setLoading: (loading: boolean) => void;
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
  children: ReactNode;
}

export function AppProvider({ manager, config, children }: AppProviderProps) {
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

  const refresh = useCallback(async () => {
    setLoading(true);
    await manager.scanAll(process.cwd(), config.projectSkillsDirs);
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
      const nextGroup = newInventory.find((group) => group.instances.some((instance) => (
        instance.provider === prev.provider && instance.path === prev.path
      )));
      const nextInstance = nextGroup?.instances.find((instance) => (
        instance.provider === prev.provider && instance.path === prev.path
      ));
      return nextInstance ?? nextGroup?.instances[0] ?? null;
    });
    setLoading(false);
  }, [manager, config]);

  return (
    <AppContext.Provider value={{
      manager, config, skills, inventory, projectSkills, scanPaths, duplicates, activeTab, view,
      selectedGroup, selectedSkill, searchQuery, loading,
      setActiveTab, setView, setSelectedGroup, setSelectedSkill, setSearchQuery, setLoading, refresh,
    }}>
      {children}
    </AppContext.Provider>
  );
}
