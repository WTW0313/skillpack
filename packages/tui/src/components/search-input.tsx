import { Box, Text, useInput } from 'ink';
import { TextInput } from '@inkjs/ui';

interface SearchInputProps {
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function SearchInput({ onChange, onSubmit, onCancel }: SearchInputProps) {
  useInput((_input, key) => {
    if (key.escape) onCancel();
  });

  return (
    <Box>
      <Text color="cyan">/ </Text>
      <TextInput placeholder="Search skills..." onChange={onChange} onSubmit={onSubmit} />
    </Box>
  );
}
