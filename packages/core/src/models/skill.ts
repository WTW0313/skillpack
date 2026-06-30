export interface SkillMetadata {
  license?: string;
  author?: string;
  tags?: string[];
}

export interface SkillSource {
  type: 'skillssh' | 'local';
  repo?: string;
  ref?: string;
  commit?: string;
  skillFolderHash?: string;
  createdAt?: string;
  installedAt?: string;
  forkedFrom?: {
    source: 'skillssh';
    identifier: string;
  };
}

export type SkillScanIssueCode = 'invalid-skill-md' | 'broken-symlink';

export interface SkillScanIssue {
  code: SkillScanIssueCode;
  message: string;
}

export interface Skill {
  name: string;
  description: string;
  provider: string;
  path: string;
  resolvedPath?: string;
  version?: string;
  enabled: boolean;
  scope: 'global' | 'project';
  metadata: SkillMetadata;
  source?: SkillSource;
  scanIssues?: SkillScanIssue[];
}

export interface SkillTemplate {
  name: string;
  description: string;
  metadata?: Partial<SkillMetadata>;
}
