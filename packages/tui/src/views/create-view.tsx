import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput, Spinner } from '@inkjs/ui';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { useAppContext } from '../context/app-context.js';

type CreateStep = 'provider' | 'name' | 'description' | 'creating';

export function CreateView() {
  const { setView, manager, refresh } = useAppContext();
  const [step, setStep] = useState<CreateStep>('provider');
  const [cursor, setCursor] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const providers = manager.getProviders().filter((p) => p.capabilities.canCreate);
  const isTextStep = step === 'name' || step === 'description';

  useInput((input, key) => {
    if (key.escape) {
      if (step === 'provider') { setView('list'); return; }
      if (step === 'name') { setStep('provider'); return; }
      if (step === 'description') { setStep('name'); return; }
      return;
    }
    if (step === 'provider') {
      if (input === 'j' || key.downArrow) setCursor((c) => Math.min(c + 1, providers.length - 1));
      if (input === 'k' || key.upArrow) setCursor((c) => Math.max(c - 1, 0));
      if (key.return && providers[cursor]) {
        setSelectedProvider(providers[cursor].id);
        setStep('name');
      }
    }
  }, { isActive: !isTextStep });

  const handleNameSubmit = (value: string) => {
    if (!value.trim()) {
      setError('Name cannot be empty');
      return;
    }
    setName(value.trim());
    setError('');
    setStep('description');
  };

  const handleDescriptionSubmit = async (description: string) => {
    setStep('creating');
    try {
      const skill = await manager.createSkill(selectedProvider, {
        name,
        description: description.trim(),
      });
      const editor = process.env.EDITOR || 'vi';
      const skillMd = path.join(skill.path, 'SKILL.md');
      try {
        execSync(`${editor} "${skillMd}"`, { stdio: 'inherit' });
      } catch { /* editor exited non-zero */ }
      await refresh();
      setView('list');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep('provider');
    }
  };

  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      <Text bold color="cyan">Create Skill</Text>

      {error !== '' && <Text color="red">{error}</Text>}

      {step === 'provider' && (
        <Box flexDirection="column" marginY={1}>
          <Text bold>Select provider:</Text>
          {providers.map((p, i) => (
            <Text key={p.id} color={i === cursor ? 'cyan' : undefined}>
              {i === cursor ? '> ' : '  '}{p.displayName}
            </Text>
          ))}
        </Box>
      )}

      {step === 'name' && (
        <Box flexDirection="column" marginY={1}>
          <Text bold>Skill name:</Text>
          <Box>
            <Text color="cyan">&gt; </Text>
            <TextInput placeholder="my-skill" onSubmit={handleNameSubmit} />
          </Box>
        </Box>
      )}

      {step === 'description' && (
        <Box flexDirection="column" marginY={1}>
          <Text bold>Description:</Text>
          <Box>
            <Text color="cyan">&gt; </Text>
            <TextInput placeholder="What does this skill do?" onSubmit={handleDescriptionSubmit} />
          </Box>
        </Box>
      )}

      {step === 'creating' && (
        <Box marginY={1}>
          <Spinner label="Creating skill..." />
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Esc: back</Text>
      </Box>
    </Box>
  );
}
