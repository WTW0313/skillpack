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
