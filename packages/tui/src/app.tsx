import { useState } from 'react';
import { Box, Text, useApp } from 'ink';
import { useInput } from 'ink';
import { Spinner } from '@inkjs/ui';
import { AppProvider, useAppContext } from './context/app-context.js';
import { useSkillManager } from './hooks/use-skill-manager.js';
import { ListView } from './views/list-view.js';
import { DetailView } from './views/detail-view.js';
import { InstallView } from './views/install-view.js';
import { ProjectSkillsView } from './views/project-skills-view.js';
import { SettingsView } from './views/settings-view.js';
import { UpdatesView } from './views/updates-view.js';
import { UsageView } from './views/usage-view.js';
import { TerminalSizeProvider, useTerminalSize } from './hooks/use-terminal-size.js';
import { getTerminalMode, type TerminalSize } from './lib/responsive-layout.js';
import { HelpOverlay } from './components/help-overlay.js';
import type { SkillManager, SkillpackConfig } from '@skillpack/core';

function Router() {
  const { view } = useAppContext();

  switch (view) {
    case 'list': return <ListView />;
    case 'detail': return <DetailView />;
    case 'install': return <InstallView />;
    case 'project': return <ProjectSkillsView />;
    case 'settings': return <SettingsView />;
    case 'updates': return <UpdatesView />;
    case 'usage': return <UsageView />;
  }
}

function AppFrame() {
  const [helpOpen, setHelpOpen] = useState(false);

  useInput((input, key) => {
    if (input === '?') {
      setHelpOpen((open) => !open);
      return;
    }
    if (key.escape && helpOpen) {
      setHelpOpen(false);
    }
  });

  return helpOpen ? <HelpOverlay onClose={() => setHelpOpen(false)} /> : <Router />;
}

function TooSmallTerminalView({ rows }: { rows: number }) {
  const { exit } = useApp();

  useInput((input) => {
    if (input === 'q') exit();
  });

  return (
    <Box flexDirection="column" height={rows} paddingX={1}>
      <Text bold>skillpack</Text>
      <Text dimColor>Terminal too small</Text>
      <Text dimColor>Resize to at least 60x18.</Text>
      <Box flexGrow={1} />
      <Text dimColor>q quit</Text>
    </Box>
  );
}

export interface AppSurfaceProps {
  manager: SkillManager | null;
  config: SkillpackConfig | null;
  onUsageImportConsentChange?: (importConsent: boolean) => Promise<SkillpackConfig>;
  error: string | null;
  terminalSize?: TerminalSize;
}

function AppSurfaceContent({ manager, config, onUsageImportConsentChange, error }: Omit<AppSurfaceProps, 'terminalSize'>) {
  const { columns, rows } = useTerminalSize();
  const terminalMode = getTerminalMode({ columns, rows });

  if (error) {
    return (
      <Box height={rows}>
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  if (!manager || !config) {
    return (
      <Box height={rows}>
        <Spinner label="Loading skillpack..." />
      </Box>
    );
  }

  if (terminalMode === 'too-small') {
    return <TooSmallTerminalView rows={rows} />;
  }

  return (
    <AppProvider manager={manager} config={config} onUsageImportConsentChange={onUsageImportConsentChange}>
      <Box flexDirection="column" height={rows}>
        <AppFrame />
      </Box>
    </AppProvider>
  );
}

export function AppSurface({ manager, config, onUsageImportConsentChange, error, terminalSize }: AppSurfaceProps) {
  const content = (
    <AppSurfaceContent
      manager={manager}
      config={config}
      onUsageImportConsentChange={onUsageImportConsentChange}
      error={error}
    />
  );

  return terminalSize
    ? <TerminalSizeProvider size={terminalSize}>{content}</TerminalSizeProvider>
    : content;
}

export function App() {
  const { manager, config, error, setUsageImportConsent } = useSkillManager();

  return <AppSurface manager={manager} config={config} onUsageImportConsentChange={setUsageImportConsent} error={error} />;
}
