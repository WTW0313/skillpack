import { Box, Text, useInput } from 'ink';
import { TextInput } from '@inkjs/ui';

interface SearchInputProps {
  defaultValue?: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function SearchInput({ defaultValue, onChange, onSubmit, onCancel }: SearchInputProps) {
  useInput((_input, key) => {
    if (key.escape) onCancel();
  });

  return (
    <Box>
      <Text color="magenta" bold>/ </Text>
      <TextInput
        defaultValue={defaultValue}
        placeholder="filter skills…"
        onChange={onChange}
        onSubmit={onSubmit}
      />
    </Box>
  );
}
