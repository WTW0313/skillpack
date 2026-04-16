import { Box, Text } from 'ink';
import { Spinner } from '@inkjs/ui';
import { AppProvider, useAppContext } from './context/app-context.js';
import { useSkillManager } from './hooks/use-skill-manager.js';
import { ListView } from './views/list-view.js';
import { DetailView } from './views/detail-view.js';
import { InstallView } from './views/install-view.js';
import { CreateView } from './views/create-view.js';
import { useTerminalSize } from './hooks/use-terminal-size.js';

function Router() {
  const { view } = useAppContext();

  switch (view) {
    case 'list': return <ListView />;
    case 'detail': return <DetailView />;
    case 'install': return <InstallView />;
    case 'create': return <CreateView />;
  }
}

export function App() {
  const { manager, config, error } = useSkillManager();
  const { rows } = useTerminalSize();

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

  return (
    <AppProvider manager={manager} config={config}>
      <Box flexDirection="column" height={rows}>
        <Router />
      </Box>
    </AppProvider>
  );
}
