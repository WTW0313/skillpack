export type ScanPathScope = 'provider' | 'project';
export type ScanPathKind = 'skill-root' | 'plugin-cache' | 'project-root';

export interface ProviderScanPath {
  path: string;
  kind: Exclude<ScanPathKind, 'project-root'>;
  label: string;
}

export interface ScanPathDiagnostic {
  scope: ScanPathScope;
  path: string;
  exists: boolean;
  kind: ScanPathKind;
  label: string;
  provider?: string;
}
