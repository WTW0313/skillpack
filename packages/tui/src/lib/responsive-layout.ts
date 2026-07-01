export type TerminalMode = 'full' | 'compact' | 'too-small';
export type StatusBarVariant = 'full' | 'compact' | 'minimal';

export interface TerminalSize {
  columns: number;
  rows: number;
}

export interface GlyphSet {
  brand: string;
  selected: string;
  warning: string;
  enabled: string;
  disabled: string;
}

export function getTerminalMode(size: TerminalSize): TerminalMode {
  if (size.columns < 60 || size.rows < 18) return 'too-small';
  if (size.columns < 80 || size.rows < 24) return 'compact';
  return 'full';
}

export function shouldUseAsciiGlyphs(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SKILLPACK_ASCII === '1' || env.TERM === 'dumb';
}

export function getGlyphSet(ascii = shouldUseAsciiGlyphs()): GlyphSet {
  return ascii
    ? { brand: '*', selected: '>', warning: '!', enabled: '+', disabled: '-' }
    : { brand: '◆', selected: '❯', warning: '⚠', enabled: '●', disabled: '○' };
}

export function fitCell(value: string, width: number): string {
  if (width <= 0) return '';
  if (value.length <= width) return value.padEnd(width);
  if (width === 1) return '…';
  return `${value.slice(0, width - 1)}…`;
}

export function formatInventoryStatus(enabled: boolean, variant: 'full' | 'compact'): string {
  if (variant === 'compact') return fitCell(enabled ? 'on' : 'off', COMPACT_STATUS_WIDTH);
  return fitCell(enabled ? 'enabled' : 'disabled', FULL_STATUS_WIDTH);
}

export interface InventoryLayoutInput {
  size: TerminalSize;
  searching: boolean;
  hasSearchQuery: boolean;
  skillCount: number;
}

export interface InventoryLayout {
  mode: TerminalMode;
  visibleRows: number;
  rowWidth: number;
  statusBarVariant: StatusBarVariant;
  columns: {
    name: number;
    provider: number;
    status: number;
  };
}

export interface ShortcutLayoutItem {
  key: string;
  label: string;
  compactLabel?: string;
  displayLabel?: string;
}

export type DetailSectionId = 'summary' | 'paths' | 'source' | 'description' | 'warnings' | 'actions';

export interface DetailSection {
  id: DetailSectionId;
  label: string;
}

export interface DetailLayoutInput {
  size: TerminalSize;
  hasDescription: boolean;
  hasWarnings: boolean;
}

export interface DetailLayout {
  mode: TerminalMode;
  sectioned: boolean;
  visibleRows: number;
  sections: DetailSection[];
}

export interface BoundedContentLayoutInput {
  size: TerminalSize;
  fullChromeLines: number;
  compactChromeLines: number;
}

export interface BoundedContentLayout {
  mode: TerminalMode;
  visibleRows: number;
}

export interface ProjectSkillsColumns {
  name: number;
  path: number;
  state: number;
  rowWidth: number;
}

export interface SettingsColumns {
  scope: number;
  kind: number;
  status: number;
  path: number;
  rowWidth: number;
}

const FULL_CHROME_LINES = 7;
const COMPACT_CHROME_LINES = 5;
const HORIZONTAL_PADDING = 2;
const MIN_NAME_WIDTH = 12;
const MAX_NAME_WIDTH = 30;
const FULL_PROVIDER_WIDTH = 10;
const COMPACT_PROVIDER_WIDTH = 8;
const FULL_STATUS_WIDTH = 8;
const COMPACT_STATUS_WIDTH = 3;
const ROW_FIXED_WIDTH = 6;
const DETAIL_FULL_CHROME_LINES = 13;
const DETAIL_COMPACT_CHROME_LINES = 6;
const DETAIL_SECTIONS: DetailSection[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'paths', label: 'Paths' },
  { id: 'source', label: 'Source' },
  { id: 'description', label: 'Description' },
  { id: 'warnings', label: 'Warnings' },
  { id: 'actions', label: 'Actions' },
];
const PROJECT_STATE_WIDTH = 15;
const SETTINGS_STATUS_WIDTH = 8;

export function getInventoryLayout(input: InventoryLayoutInput): InventoryLayout {
  const mode = getTerminalMode(input.size);
  if (mode === 'too-small') {
    return {
      mode,
      visibleRows: 0,
      rowWidth: Math.max(0, input.size.columns),
      statusBarVariant: 'minimal',
      columns: { name: 0, provider: 0, status: 0 },
    };
  }

  const provider = mode === 'full' ? FULL_PROVIDER_WIDTH : COMPACT_PROVIDER_WIDTH;
  const status = mode === 'full' ? FULL_STATUS_WIDTH : COMPACT_STATUS_WIDTH;
  const contentWidth = Math.max(0, input.size.columns - HORIZONTAL_PADDING);
  const availableNameWidth = contentWidth - ROW_FIXED_WIDTH - provider - status;
  const name = Math.max(MIN_NAME_WIDTH, Math.min(MAX_NAME_WIDTH, availableNameWidth));
  const rowWidth = ROW_FIXED_WIDTH + name + provider + status;
  const searchLines = input.searching ? 2 : 0;
  const filterLines = !input.searching && input.hasSearchQuery ? 1 : 0;
  const chromeLines = mode === 'full' ? FULL_CHROME_LINES : COMPACT_CHROME_LINES;

  return {
    mode,
    visibleRows: Math.max(1, input.size.rows - chromeLines - searchLines - filterLines),
    rowWidth,
    statusBarVariant: mode === 'full' ? 'full' : 'compact',
    columns: { name, provider, status },
  };
}

export function measureShortcutLine(shortcuts: ShortcutLayoutItem[]): number {
  return shortcuts.reduce((width, shortcut, index) => {
    const label = shortcut.displayLabel ?? shortcut.label;
    return width + shortcut.key.length + 1 + label.length + (index > 0 ? 2 : 0);
  }, 0);
}

export function getVisibleShortcuts(
  shortcuts: ShortcutLayoutItem[],
  size: TerminalSize,
): Array<ShortcutLayoutItem & { displayLabel: string }> {
  const mode = getTerminalMode(size);
  const maxWidth = Math.max(0, size.columns - HORIZONTAL_PADDING);
  const result: Array<ShortcutLayoutItem & { displayLabel: string }> = [];

  for (const shortcut of shortcuts) {
    const displayLabel = mode === 'compact'
      ? (shortcut.compactLabel ?? shortcut.label)
      : shortcut.label;
    const next = [...result, { ...shortcut, displayLabel }];
    if (mode === 'compact' && measureShortcutLine(next) > maxWidth) break;
    result.push({ ...shortcut, displayLabel });
  }

  return result;
}

export function getDetailLayout(input: DetailLayoutInput): DetailLayout {
  const mode = getTerminalMode(input.size);
  if (mode === 'too-small') {
    return {
      mode,
      sectioned: true,
      visibleRows: 0,
      sections: DETAIL_SECTIONS,
    };
  }

  const chromeLines = mode === 'full' ? DETAIL_FULL_CHROME_LINES : DETAIL_COMPACT_CHROME_LINES;
  return {
    mode,
    sectioned: mode === 'compact',
    visibleRows: Math.max(1, input.size.rows - chromeLines),
    sections: DETAIL_SECTIONS,
  };
}

export function getBoundedContentLayout(input: BoundedContentLayoutInput): BoundedContentLayout {
  const mode = getTerminalMode(input.size);
  if (mode === 'too-small') return { mode, visibleRows: 0 };
  const chromeLines = mode === 'full' ? input.fullChromeLines : input.compactChromeLines;
  return {
    mode,
    visibleRows: Math.max(1, input.size.rows - chromeLines),
  };
}

export function getProjectSkillsColumns(size: TerminalSize): ProjectSkillsColumns {
  const mode = getTerminalMode(size);
  const contentWidth = Math.max(0, size.columns - HORIZONTAL_PADDING);
  const state = mode === 'compact' ? 14 : PROJECT_STATE_WIDTH;
  const fixedWidth = 5 + state;
  const name = Math.max(12, Math.min(30, Math.floor((contentWidth - fixedWidth) * 0.4)));
  const path = Math.max(12, contentWidth - fixedWidth - name);
  return {
    name,
    path,
    state,
    rowWidth: fixedWidth + name + path,
  };
}

export function getSettingsColumns(size: TerminalSize): SettingsColumns {
  const contentWidth = Math.max(0, size.columns - HORIZONTAL_PADDING);
  const scope = Math.max(8, Math.min(12, Math.floor(contentWidth * 0.2)));
  const kind = Math.max(8, Math.min(13, Math.floor(contentWidth * 0.22)));
  const status = SETTINGS_STATUS_WIDTH;
  const fixedWidth = scope + kind + status + 3;
  const path = Math.max(10, contentWidth - fixedWidth);
  return {
    scope,
    kind,
    status,
    path,
    rowWidth: fixedWidth + path,
  };
}
