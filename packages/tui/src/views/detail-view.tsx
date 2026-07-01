import { useState, useMemo, type ReactNode } from 'react';
import { Box, Text, useInput } from 'ink';
import { Spinner } from '@inkjs/ui';
import { execSync } from 'node:child_process';
import { useAppContext } from '../context/app-context.js';
import { useTerminalSize } from '../hooks/use-terminal-size.js';
import { ConfirmDialog } from '../components/confirm-dialog.js';
import { StatusBar } from '../components/status-bar.js';
import { formatPluginToggleMessage, isPluginOwnedSkill } from '../lib/plugin-toggle.js';
import { getDetailLayout, getGlyphSet, type DetailSectionId } from '../lib/responsive-layout.js';
import type { UpdateInfo } from '@skillpack/core';

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

export function DetailView() {
  const { selectedSkill, setView, refresh, manager } = useAppContext();
  const { columns, rows } = useTerminalSize();
  const [confirming, setConfirming] = useState<'remove' | 'plugin-toggle' | 'update' | null>(null);
  const [activeSection, setActiveSection] = useState<DetailSectionId>('summary');
  const [descScroll, setDescScroll] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const glyphs = getGlyphSet();

  const sourceType = selectedSkill?.source?.type;
  const isUpdatable = sourceType === 'skillssh';
  const isRemovable = selectedSkill?.provider === 'global' && sourceType === 'skillssh';
  const canToggle = selectedSkill
    ? Boolean(manager.getProvider(selectedSkill.provider)?.getDisableStrategy(selectedSkill))
    : false;
  const disableStrategy = selectedSkill
    ? manager.getProvider(selectedSkill.provider)?.getDisableStrategy(selectedSkill)
    : undefined;

  const duplicate = selectedSkill
    ? manager.getDuplicates().find((d) => d.skillName === selectedSkill.name)
    : undefined;

  const addedAt = selectedSkill?.source?.installedAt ?? selectedSkill?.source?.createdAt;

  const descLines = useMemo(() => {
    if (!selectedSkill?.description) return [];
    return selectedSkill.description.split('\n');
  }, [selectedSkill]);

  const detailLayout = getDetailLayout({
    size: { columns, rows },
    hasDescription: descLines.length > 0,
    hasWarnings: Boolean(duplicate),
  });

  const fullVisibleDescRows = useMemo(() => {
    if (!selectedSkill) return 0;
    let used = 2; // padding (top + bottom)
    used += 1;    // title
    used += 1;    // gap before metadata
    used += 3;    // agent, path, status
    if (selectedSkill.version) used += 1;
    if (selectedSkill.source) used += 1;
    if (selectedSkill.origin?.type === 'plugin') used += 2;
    if (disableStrategy) used += 1;
    if (isUpdatable) used += 1; // update row
    if (addedAt) used += 1;
    if (duplicate) used += 1 + 1 + duplicate.instances.length; // gap + heading + instances
    used += 1;    // gap before description
    used += 1;    // separator
    used += 1;    // "description" label
    used += 1;    // status bar
    if (error) used += 1;
    return Math.max(0, rows - used);
  }, [selectedSkill, duplicate, error, rows, isUpdatable, disableStrategy]);

  const visibleDescRows = detailLayout.sectioned
    ? Math.max(1, detailLayout.visibleRows - 1)
    : fullVisibleDescRows;

  useInput((input, key) => {
    if (key.escape) { setView('list'); return; }
    if (key.tab && detailLayout.sectioned) {
      const idx = detailLayout.sections.findIndex((section) => section.id === activeSection);
      const next = key.shift
        ? (idx - 1 + detailLayout.sections.length) % detailLayout.sections.length
        : (idx + 1) % detailLayout.sections.length;
      setActiveSection(detailLayout.sections[next].id);
      return;
    }
    if ((input === 'o' || input === 'O') && selectedSkill) {
      const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
      try {
        execSync(`${opener} "${selectedSkill.path}"`, { stdio: 'ignore' });
      } catch { /* opener failed */ }
      return;
    }
    if (input === ' ' && selectedSkill && canToggle && !busy) {
      if (isPluginOwnedSkill(selectedSkill)) {
        setConfirming('plugin-toggle');
        return;
      }
      setError(null);
      setNotice(null);
      setBusy(true);
      manager.toggleSkill(selectedSkill)
        .then(() => refresh())
        .then(() => setNotice('Availability updated.'))
        .catch((err: Error) => setError(err.message))
        .finally(() => setBusy(false));
      return;
    }
    if (input === 'd' && selectedSkill && isRemovable) {
      setError(null);
      setConfirming('remove');
    }
    if (input === 'u' && selectedSkill && isUpdatable && !busy && !checkingUpdate && !updating) {
      setError(null);
      setNotice(null);
      if (updateInfo?.hasUpdate) {
        setConfirming('update');
      } else if (!updateInfo) {
        setCheckingUpdate(true);
        manager.checkSkillUpdate(selectedSkill)
          .then((info) => setUpdateInfo(info ?? { hasUpdate: false }))
          .catch((err: Error) => setError(err.message))
          .finally(() => setCheckingUpdate(false));
      }
    }
    if (key.downArrow && (!detailLayout.sectioned || activeSection === 'description')) {
      setDescScroll((s) => Math.min(s + 1, Math.max(0, descLines.length - visibleDescRows)));
    }
    if (key.upArrow && (!detailLayout.sectioned || activeSection === 'description')) {
      setDescScroll((s) => Math.max(0, s - 1));
    }
  }, { isActive: !confirming });

  if (!selectedSkill) {
    return <Box><Text color="red">No skill selected</Text></Box>;
  }

  if (confirming === 'remove') {
    return (
      <Box flexDirection="column" padding={1}>
        <ConfirmDialog
          message={`Delete "${selectedSkill.name}"?`}
          onConfirm={async () => {
            try {
              await manager.uninstallSkill(selectedSkill);
              await refresh();
              setView('list');
            } catch (err) {
              setConfirming(null);
              setError((err as Error).message);
            }
          }}
          onCancel={() => setConfirming(null)}
        />
      </Box>
    );
  }

  if (confirming === 'plugin-toggle') {
    return (
      <Box flexDirection="column" padding={1}>
        <ConfirmDialog
          message={formatPluginToggleMessage(selectedSkill, manager.getAllSkills())}
          onConfirm={() => {
            setError(null);
            setBusy(true);
            manager.toggleSkill(selectedSkill)
              .then(() => refresh())
              .then(() => setNotice('Plugin availability updated.'))
              .catch((err: Error) => setError(err.message))
              .finally(() => {
                setBusy(false);
                setConfirming(null);
              });
          }}
          onCancel={() => setConfirming(null)}
        />
      </Box>
    );
  }

  if (confirming === 'update') {
    return (
      <Box flexDirection="column" padding={1}>
        <ConfirmDialog
          message={`Update "${selectedSkill.name}" from ${updateInfo?.currentVersion ?? '?'} to ${updateInfo?.latestVersion ?? 'latest'}?`}
          onConfirm={() => {
            setError(null);
            setNotice(null);
            setUpdating(true);
            manager.updateSkill(selectedSkill)
              .then(() => refresh())
              .then(() => {
                setUpdateInfo(null);
                setNotice('Skill updated.');
              })
              .catch((err: Error) => setError(err.message))
              .finally(() => {
                setUpdating(false);
                setConfirming(null);
              });
          }}
          onCancel={() => setConfirming(null)}
        />
      </Box>
    );
  }

  const visibleDesc = descLines.slice(descScroll, descScroll + visibleDescRows);
  const descScrollable = descLines.length > visibleDescRows;

  if (detailLayout.sectioned) {
    const renderSection = (): ReactNode => {
      switch (activeSection) {
        case 'summary':
          return (
            <>
              <Box gap={1}>
                <Text dimColor>{'agent'.padEnd(10)}</Text>
                <Text>{selectedSkill.provider}</Text>
              </Box>
              <Box gap={1}>
                <Text dimColor>{'status'.padEnd(10)}</Text>
                <Text color={selectedSkill.enabled ? 'green' : undefined} dimColor={!selectedSkill.enabled}>
                  {selectedSkill.enabled ? 'enabled' : 'disabled'}
                </Text>
              </Box>
              {selectedSkill.version && (
                <Box gap={1}>
                  <Text dimColor>{'version'.padEnd(10)}</Text>
                  <Text>{selectedSkill.version}</Text>
                </Box>
              )}
              {addedAt && (
                <Box gap={1}>
                  <Text dimColor>{'added'.padEnd(10)}</Text>
                  <Text>{formatRelativeTime(addedAt)}</Text>
                </Box>
              )}
            </>
          );
        case 'paths':
          return (
            <Box flexDirection="column">
              <Text dimColor>path</Text>
              <Text wrap="truncate">{selectedSkill.path}</Text>
              {selectedSkill.resolvedPath && (
                <>
                  <Text dimColor>resolved</Text>
                  <Text wrap="truncate">{selectedSkill.resolvedPath}</Text>
                </>
              )}
            </Box>
          );
        case 'source':
          return (
            <>
              {selectedSkill.source && (
                <Box gap={1}>
                  <Text dimColor>{'source'.padEnd(10)}</Text>
                  <Text>{selectedSkill.source.type}{selectedSkill.source.repo ? ` ${selectedSkill.source.repo}` : ''}</Text>
                </Box>
              )}
              {selectedSkill.origin?.type === 'plugin' && (
                <>
                  <Box gap={1}>
                    <Text dimColor>{'plugin'.padEnd(10)}</Text>
                    <Text>{selectedSkill.origin.displayName ?? selectedSkill.origin.pluginName}</Text>
                  </Box>
                  <Box gap={1}>
                    <Text dimColor>{'plugin on'.padEnd(10)}</Text>
                    <Text>{selectedSkill.origin.pluginEnabled ? 'enabled' : 'disabled'}</Text>
                  </Box>
                </>
              )}
              {disableStrategy && (
                <Box gap={1}>
                  <Text dimColor>{'toggle'.padEnd(10)}</Text>
                  <Text wrap="truncate">{disableStrategy.description}</Text>
                </Box>
              )}
            </>
          );
        case 'description':
          return descLines.length === 0 ? (
            <Text dimColor>No description.</Text>
          ) : (
            <Box flexDirection="column">
              {descScrollable && (
                <Text dimColor>{descScroll + 1}-{Math.min(descScroll + visibleDescRows, descLines.length)} of {descLines.length}</Text>
              )}
              {visibleDesc.map((line, i) => (
                <Text key={i} wrap="truncate">{line}</Text>
              ))}
            </Box>
          );
        case 'warnings':
          return duplicate ? (
            <Box flexDirection="column">
              <Text color="yellow">Duplicates</Text>
              {duplicate.instances.map((inst) => (
                <Text key={`${inst.provider}:${inst.path}`} dimColor wrap="truncate">
                  {inst.provider} {'->'} {inst.path}
                </Text>
              ))}
            </Box>
          ) : (
            <Text dimColor>No warnings.</Text>
          );
        case 'actions':
          return (
            <Box flexDirection="column">
              <Text>{canToggle ? 'space toggle availability' : 'toggle unavailable'}</Text>
              <Text>{isUpdatable ? 'u check/apply update' : 'update unavailable'}</Text>
              <Text>{isRemovable ? 'd delete skills.sh Global Skill' : 'delete unavailable'}</Text>
              <Text>o open folder</Text>
            </Box>
          );
      }
    };

    return (
      <Box flexDirection="column" flexGrow={1} padding={1}>
        <Box>
          <Text dimColor>‹ esc  </Text>
          <Text bold color="magenta">{glyphs.brand}</Text>
          <Text bold> {selectedSkill.name}</Text>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Box gap={1}>
            <Text dimColor>{'agent'.padEnd(8)}</Text>
            <Text>{selectedSkill.provider}</Text>
          </Box>
          <Box gap={1}>
            <Text dimColor>{'status'.padEnd(8)}</Text>
            <Text color={selectedSkill.enabled ? 'green' : undefined} dimColor={!selectedSkill.enabled}>
              {selectedSkill.enabled ? 'enabled' : 'disabled'}
            </Text>
          </Box>
        </Box>

        <Box marginTop={1}>
          {detailLayout.sections.map((section, index) => (
            <Text key={section.id}>
              {index > 0 && <Text dimColor> │ </Text>}
              <Text bold={section.id === activeSection} underline={section.id === activeSection} dimColor={section.id !== activeSection}>
                {section.label.toLowerCase()}
              </Text>
            </Text>
          ))}
        </Box>

        <Box flexDirection="column" marginTop={1} height={detailLayout.visibleRows}>
          {renderSection()}
        </Box>

        <Box flexGrow={1} />
        {notice && (
          <Box paddingX={1}>
            <Text color="green">{notice}</Text>
          </Box>
        )}
        {error && (
          <Box paddingX={1}>
            <Text color="red">✗ {error}</Text>
          </Box>
        )}
        <StatusBar />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      {/* Navigation + title */}
      <Box>
        <Text dimColor>‹ esc  </Text>
        <Text bold color="magenta">{glyphs.brand}</Text>
        <Text bold> {selectedSkill.name}</Text>
      </Box>

      {/* Metadata */}
      <Box marginTop={1} flexDirection="column" gap={0}>
        <Box gap={1}>
          <Text dimColor>{'agent'.padEnd(10)}</Text>
          <Text>{selectedSkill.provider}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>{'path'.padEnd(10)}</Text>
          <Text dimColor>{selectedSkill.path}{selectedSkill.resolvedPath ? ` → ${selectedSkill.resolvedPath}` : ''}</Text>
        </Box>
        {selectedSkill.version && (
          <Box gap={1}>
            <Text dimColor>{'version'.padEnd(10)}</Text>
            <Text>{selectedSkill.version}</Text>
          </Box>
        )}
        {selectedSkill.source && (
          <Box gap={1}>
            <Text dimColor>{'source'.padEnd(10)}</Text>
            <Text>{selectedSkill.source.type}{selectedSkill.source.repo ? ` ${selectedSkill.source.repo}` : ''}</Text>
            {selectedSkill.source.type === 'skillssh' && selectedSkill.source.skillFolderHash && (
              <Text dimColor> #{selectedSkill.source.skillFolderHash.slice(0, 7)}</Text>
            )}
          </Box>
        )}
        {selectedSkill.origin?.type === 'plugin' && (
          <>
            <Box gap={1}>
              <Text dimColor>{'plugin'.padEnd(10)}</Text>
              <Text>{selectedSkill.origin.displayName ?? selectedSkill.origin.pluginName}</Text>
              <Text dimColor> {selectedSkill.origin.pluginId}</Text>
            </Box>
            <Box gap={1}>
              <Text dimColor>{'plugin on'.padEnd(10)}</Text>
              <Text color={selectedSkill.origin.pluginEnabled ? 'green' : undefined} dimColor={!selectedSkill.origin.pluginEnabled}>
                {selectedSkill.origin.pluginEnabled ? '● enabled' : '○ disabled'}
              </Text>
              <Text dimColor>skill override </Text>
              <Text color={selectedSkill.origin.skillConfigEnabled === false ? 'yellow' : undefined}>
                {selectedSkill.origin.skillConfigEnabled === false ? 'disabled' : 'default'}
              </Text>
            </Box>
          </>
        )}
        {disableStrategy && (
          <Box gap={1}>
            <Text dimColor>{'toggle'.padEnd(10)}</Text>
            <Text>{disableStrategy.description}</Text>
          </Box>
        )}
        {isUpdatable && (
          <Box gap={1}>
            <Text dimColor>{'update'.padEnd(10)}</Text>
            {checkingUpdate && <Spinner label="" />}
            {checkingUpdate && <Text dimColor>checking…</Text>}
            {!checkingUpdate && updating && <Spinner label="" />}
            {!checkingUpdate && updating && <Text color="magenta">updating…</Text>}
            {!checkingUpdate && !updating && updateInfo?.hasUpdate && (
              <>
                <Text color="green">{updateInfo.currentVersion ?? '?'}</Text>
                <Text color="magenta"> → </Text>
                <Text color="green" bold>{updateInfo.latestVersion ?? '?'}</Text>
                <Text dimColor>  press </Text>
                <Text bold>u</Text>
                <Text dimColor> to update</Text>
              </>
            )}
            {!checkingUpdate && !updating && updateInfo && !updateInfo.hasUpdate && (
              <Text dimColor>up to date ✓</Text>
            )}
            {!checkingUpdate && !updating && !updateInfo && (
              <>
                <Text dimColor>press </Text>
                <Text bold>u</Text>
                <Text dimColor> to check</Text>
              </>
            )}
          </Box>
        )}
        {addedAt && (
          <Box gap={1}>
            <Text dimColor>{'added'.padEnd(10)}</Text>
            <Text>{formatRelativeTime(addedAt)}</Text>
            <Text dimColor> ({new Date(addedAt).toLocaleDateString()})</Text>
          </Box>
        )}
        <Box gap={1}>
          <Text dimColor>{'status'.padEnd(10)}</Text>
          <Text color={selectedSkill.enabled ? 'green' : undefined} dimColor={!selectedSkill.enabled}>
            {selectedSkill.enabled ? '● enabled' : '○ disabled'}
          </Text>
        </Box>
      </Box>

      {/* Duplicates */}
      {duplicate && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="yellow">{glyphs.warning} Duplicates</Text>
          {duplicate.instances.map((inst) => (
            <Text key={`${inst.provider}:${inst.path}`} dimColor>
              {'  '}{inst.provider} → {inst.path}
            </Text>
          ))}
        </Box>
      )}

      {/* Description */}
      {descLines.length > 0 && visibleDescRows > 0 && (
        <Box flexDirection="column" marginTop={1} height={visibleDescRows + 2}>
          <Box>
            <Text dimColor>{'─'.repeat(40)}</Text>
          </Box>
          {descScrollable && (
            <Box gap={1}>
              <Text dimColor>description</Text>
              {descScroll > 0 && <Text>▲</Text>}
              <Text dimColor>{descScroll + 1}–{Math.min(descScroll + visibleDescRows, descLines.length)} of {descLines.length}</Text>
              {descScroll + visibleDescRows < descLines.length && <Text>▼</Text>}
            </Box>
          )}
          {!descScrollable && <Text dimColor>description</Text>}
          <Box flexDirection="column" marginTop={0}>
            {visibleDesc.map((line, i) => (
              <Text key={i} wrap="truncate">{line}</Text>
            ))}
          </Box>
        </Box>
      )}

      <Box flexGrow={1} />
      {notice && (
        <Box paddingX={1}>
          <Text color="green">{notice}</Text>
        </Box>
      )}
      {error && (
        <Box paddingX={1}>
          <Text color="red">✗ {error}</Text>
        </Box>
      )}
      <StatusBar />
    </Box>
  );
}
