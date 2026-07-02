import { Box, Text, useInput } from 'ink';
import { getGlyphSet } from '../lib/responsive-layout.js';

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  const glyphs = getGlyphSet();

  useInput((input) => {
    if (input === 'y' || input === 'Y') onConfirm();
    if (input === 'n' || input === 'N') onCancel();
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Box>
        <Text color="yellow" bold>{glyphs.warning} </Text>
        <Text>{message}</Text>
      </Box>
      <Box>
        <Text dimColor>  Press </Text>
        <Text bold color="green">y</Text>
        <Text dimColor> to confirm or </Text>
        <Text bold color="red">n</Text>
        <Text dimColor> to cancel</Text>
      </Box>
    </Box>
  );
}
