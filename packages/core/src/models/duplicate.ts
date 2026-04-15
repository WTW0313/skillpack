export interface DuplicateInstance {
  provider: string;
  path: string;
  version?: string;
}

export interface DuplicateInfo {
  skillName: string;
  instances: DuplicateInstance[];
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
