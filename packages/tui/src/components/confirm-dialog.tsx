import { Box, Text, useInput } from 'ink';

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  useInput((input) => {
    if (input === 'y' || input === 'Y') onConfirm();
    if (input === 'n' || input === 'N') onCancel();
  });

  return (
    <Box>
      <Text color="yellow">{message} </Text>
      <Text dimColor>(y/n)</Text>
    </Box>
  );
}
