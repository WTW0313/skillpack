import { Box, Text } from 'ink';

interface TabBarProps {
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function TabBar({ tabs, activeTab }: TabBarProps) {
  return (
    <Box gap={1}>
      {tabs.map((tab) => (
        <Text
          key={tab}
          color={tab === activeTab ? 'cyan' : undefined}
          bold={tab === activeTab}
          dimColor={tab !== activeTab}
        >
          {tab === activeTab ? `[${tab}]` : ` ${tab} `}
        </Text>
      ))}
    </Box>
  );
}
