import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { SkillManager, Skill, DuplicateInfo, SkillInventoryInstance, SkillpackConfig } from '@skillpack/core';

export type ViewType = 'list' | 'detail' | 'install' | 'project';

interface AppState {
  manager: SkillManager;
  config: SkillpackConfig;
  skills: Skill[];
  projectSkills: SkillInventoryInstance[];
  duplicates: DuplicateInfo[];
  activeTab: string;
  view: ViewType;
  selectedSkill: Skill | null;
  searchQuery: string;
  loading: boolean;
}

interface AppContextValue extends AppState {
  setActiveTab: (tab: string) => void;
  setView: (view: ViewType) => void;
  setSelectedSkill: (skill: Skill | null) => void;
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
  const [projectSkills, setProjectSkills] = useState<SkillInventoryInstance[]>(manager.getProjectSkills());
  const [duplicates, setDuplicates] = useState<DuplicateInfo[]>(manager.getDuplicates());
  const [activeTab, setActiveTab] = useState('All');
  const [view, setView] = useState<ViewType>('list');
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    await manager.scanAll(process.cwd(), config.projectSkillsDirs);
    const newSkills = manager.getAllSkills();
    setSkills(newSkills);
    setProjectSkills(manager.getProjectSkills());
    setDuplicates(manager.getDuplicates());
    setSelectedSkill((prev) => {
      if (!prev) return null;
      return newSkills.find((s) => s.name === prev.name && s.provider === prev.provider) ?? null;
    });
    setLoading(false);
  }, [manager, config]);

  return (
    <AppContext.Provider value={{
      manager, config, skills, projectSkills, duplicates, activeTab, view, selectedSkill, searchQuery, loading,
      setActiveTab, setView, setSelectedSkill, setSearchQuery, setLoading, refresh,
    }}>
      {children}
    </AppContext.Provider>
  );
}
