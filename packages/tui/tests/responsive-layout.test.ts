import { describe, expect, it } from 'vitest';
import {
  fitCell,
  getBoundedContentLayout,
  getDetailLayout,
  getGlyphSet,
  getProjectSkillsColumns,
  getSettingsColumns,
  formatInventoryStatus,
  getVisibleShortcuts,
  getInventoryLayout,
  getTerminalMode,
  measureShortcutLine,
} from '../src/lib/responsive-layout.js';

describe('getTerminalMode', () => {
  it('classifies the agreed Terminal Envelope sizes', () => {
    expect(getTerminalMode({ columns: 80, rows: 24 })).toBe('full');
    expect(getTerminalMode({ columns: 60, rows: 18 })).toBe('compact');
    expect(getTerminalMode({ columns: 59, rows: 18 })).toBe('too-small');
    expect(getTerminalMode({ columns: 60, rows: 17 })).toBe('too-small');
  });
});

describe('getGlyphSet', () => {
  it('provides default and ASCII-safe terminal glyphs', () => {
    expect(getGlyphSet(false).selected).toBe('❯');
    expect(getGlyphSet(false).warning).toBe('⚠');
    expect(getGlyphSet(true).selected).toBe('>');
    expect(getGlyphSet(true).warning).toBe('!');
  });
});

describe('read-only view columns', () => {
  it('keeps Project Skills rows within compact width', () => {
    const columns = getProjectSkillsColumns({ columns: 60, rows: 18 });

    expect(columns.name).toBeGreaterThanOrEqual(12);
    expect(columns.path).toBeGreaterThanOrEqual(12);
    expect(columns.state).toBeGreaterThanOrEqual(8);
    expect(columns.rowWidth).toBeLessThanOrEqual(58);
  });

  it('keeps Settings rows within compact width', () => {
    const columns = getSettingsColumns({ columns: 60, rows: 18 });

    expect(columns.scope).toBeGreaterThanOrEqual(8);
    expect(columns.kind).toBeGreaterThanOrEqual(8);
    expect(columns.status).toBe(8);
    expect(columns.path).toBeGreaterThanOrEqual(10);
    expect(columns.rowWidth).toBeLessThanOrEqual(58);
  });
});

describe('getBoundedContentLayout', () => {
  it('reserves stable chrome and gives workflow views bounded rows', () => {
    const full = getBoundedContentLayout({
      size: { columns: 80, rows: 24 },
      fullChromeLines: 6,
      compactChromeLines: 4,
    });

    expect(full.mode).toBe('full');
    expect(full.visibleRows).toBe(18);

    const compact = getBoundedContentLayout({
      size: { columns: 60, rows: 18 },
      fullChromeLines: 6,
      compactChromeLines: 4,
    });

    expect(compact.mode).toBe('compact');
    expect(compact.visibleRows).toBe(14);
  });
});

describe('getDetailLayout', () => {
  it('uses one-page detail at full size and sections at compact size', () => {
    const full = getDetailLayout({ size: { columns: 80, rows: 24 }, hasDescription: true, hasWarnings: true });

    expect(full.mode).toBe('full');
    expect(full.sectioned).toBe(false);
    expect(full.sections.map((section) => section.id)).toEqual(['summary', 'paths', 'source', 'description', 'warnings', 'actions']);

    const compact = getDetailLayout({ size: { columns: 60, rows: 18 }, hasDescription: true, hasWarnings: true });

    expect(compact.mode).toBe('compact');
    expect(compact.sectioned).toBe(true);
    expect(compact.visibleRows).toBeGreaterThan(0);
    expect(compact.sections.map((section) => section.id)).toEqual(['summary', 'paths', 'source', 'description', 'warnings', 'actions']);
  });
});

describe('shortcut layout', () => {
  const shortcuts = [
    { key: '↑↓', label: 'navigate', compactLabel: 'nav' },
    { key: 'space', label: 'toggle when supported', compactLabel: 'toggle' },
    { key: 'enter', label: 'detail' },
    { key: '/', label: 'search' },
    { key: '?', label: 'help' },
    { key: 'tab', label: 'tabs' },
    { key: 'p', label: 'project' },
    { key: 's', label: 'settings' },
    { key: 'u', label: 'updates' },
    { key: 'i', label: 'install' },
    { key: 'q', label: 'quit' },
  ];

  it('keeps all shortcuts at full width', () => {
    const visible = getVisibleShortcuts(shortcuts, { columns: 120, rows: 24 });

    expect(visible.map((shortcut) => shortcut.key)).toEqual(shortcuts.map((shortcut) => shortcut.key));
  });

  it('keeps compact shortcuts within the footer width and preserves help', () => {
    const visible = getVisibleShortcuts(shortcuts, { columns: 60, rows: 18 });

    expect(visible.length).toBeLessThan(shortcuts.length);
    expect(visible.map((shortcut) => shortcut.key)).toContain('?');
    expect(measureShortcutLine(visible)).toBeLessThanOrEqual(58);
  });
});

describe('Inventory row formatting', () => {
  it('truncates and pads cells to a stable width', () => {
    expect(fitCell('short', 8)).toBe('short   ');
    expect(fitCell('very-long-skill-name', 10)).toBe('very-long…');
    expect(fitCell('anything', 0)).toBe('');
  });

  it('uses full and compact availability labels', () => {
    expect(formatInventoryStatus(true, 'full')).toBe('enabled ');
    expect(formatInventoryStatus(false, 'full')).toBe('disabled');
    expect(formatInventoryStatus(true, 'compact')).toBe('on ');
    expect(formatInventoryStatus(false, 'compact')).toBe('off');
  });
});

describe('getInventoryLayout', () => {
  it('keeps Inventory usable at full and compact Terminal Envelope sizes', () => {
    const full = getInventoryLayout({
      size: { columns: 80, rows: 24 },
      searching: false,
      hasSearchQuery: false,
      skillCount: 25,
    });

    expect(full.mode).toBe('full');
    expect(full.visibleRows).toBe(17);
    expect(full.statusBarVariant).toBe('full');
    expect(full.columns.name).toBe(30);
    expect(full.columns.provider).toBe(10);
    expect(full.columns.status).toBe(8);

    const compact = getInventoryLayout({
      size: { columns: 60, rows: 18 },
      searching: false,
      hasSearchQuery: false,
      skillCount: 25,
    });

    expect(compact.mode).toBe('compact');
    expect(compact.visibleRows).toBeGreaterThan(0);
    expect(compact.statusBarVariant).toBe('compact');
    expect(compact.columns.name).toBeGreaterThanOrEqual(12);
    expect(compact.columns.provider).toBeGreaterThanOrEqual(6);
    expect(compact.rowWidth).toBeLessThanOrEqual(58);
  });

  it('returns a minimal layout below the compact Terminal Envelope', () => {
    const layout = getInventoryLayout({
      size: { columns: 59, rows: 18 },
      searching: false,
      hasSearchQuery: false,
      skillCount: 25,
    });

    expect(layout.mode).toBe('too-small');
    expect(layout.visibleRows).toBe(0);
    expect(layout.statusBarVariant).toBe('minimal');
  });
});
