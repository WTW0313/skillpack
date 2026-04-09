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
