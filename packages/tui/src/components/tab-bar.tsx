import { Box, Text } from 'ink';

interface TabBarProps {
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  counts?: Record<string, number>;
}

export function TabBar({ tabs, activeTab, counts }: TabBarProps) {
  return (
    <Box paddingX={1} gap={0}>
      {tabs.map((tab, i) => {
        const isActive = tab === activeTab;
        const count = counts?.[tab];
        return (
          <Box key={tab}>
            {i > 0 && <Text dimColor> │ </Text>}
            <Text color={isActive ? 'white' : undefined} bold={isActive} dimColor={!isActive} underline={isActive}>
              {tab}
            </Text>
            {count !== undefined && (
              <Text dimColor={!isActive} color={isActive ? 'white' : undefined}>
                {' '}
                {count}
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
