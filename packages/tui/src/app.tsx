import { Box, Text } from 'ink';
import { Spinner } from '@inkjs/ui';
import { AppProvider, useAppContext } from './context/app-context.js';
import { useSkillManager } from './hooks/use-skill-manager.js';
import { ListView } from './views/list-view.js';
import { DetailView } from './views/detail-view.js';
import { InstallView } from './views/install-view.js';
import { CreateView } from './views/create-view.js';
import { UpdateView } from './views/update-view.js';

function Router() {
  const { view } = useAppContext();

  switch (view) {
    case 'list': return <ListView />;
    case 'detail': return <DetailView />;
    case 'install': return <InstallView />;
    case 'create': return <CreateView />;
    case 'update': return <UpdateView />;
  }
}

export function App() {
  const { manager, error } = useSkillManager();

  if (error) {
    return (
      <Box>
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  if (!manager) {
    return (
      <Box>
        <Spinner label="Loading skillpack..." />
      </Box>
    );
  }

  return (
    <AppProvider manager={manager}>
      <Router />
    </AppProvider>
  );
}
