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
  commit?: string;
  ref?: string;
}
