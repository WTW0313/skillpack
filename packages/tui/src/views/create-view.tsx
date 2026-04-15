import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput, Spinner } from '@inkjs/ui';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { useAppContext } from '../context/app-context.js';
import { StatusBar } from '../components/status-bar.js';

type CreateStep = 'provider' | 'name' | 'description' | 'creating';

export function CreateView() {
  const { setView, manager, refresh } = useAppContext();
  const [step, setStep] = useState<CreateStep>('provider');
  const [cursor, setCursor] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const providers = manager.getProviders().filter((p) => p.capabilities.canCreate);

  useInput((_input, key) => {
    if (key.escape) {
      if (step === 'provider') { setView('list'); return; }
      if (step === 'name') { setStep('provider'); return; }
      if (step === 'description') { setStep('name'); return; }
      return;
    }

    if (step === 'name' || step === 'description') return;

    if (step === 'provider') {
      if (key.downArrow) setCursor((c) => Math.min(c + 1, providers.length - 1));
      if (key.upArrow) setCursor((c) => Math.max(c - 1, 0));
      if (key.return && providers[cursor]) {
        setSelectedProvider(providers[cursor].id);
        setStep('name');
      }
    }
  });

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

  const stepLabels = ['provider', 'name', 'description'];
  const currentStepIdx = stepLabels.indexOf(step === 'creating' ? 'description' : step);

  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      {/* Header */}
      <Box>
        <Text dimColor>‹ esc  </Text>
        <Text bold color="magenta">Create Skill</Text>
      </Box>

      {/* Progress */}
      <Box marginTop={1}>
        {stepLabels.map((s, i) => (
          <Box key={s}>
            {i > 0 && <Text dimColor> › </Text>}
            <Text
              bold={i === currentStepIdx}
              color={i === currentStepIdx ? 'white' : undefined}
              dimColor={i !== currentStepIdx}
            >
              {i + 1}. {s}
            </Text>
          </Box>
        ))}
      </Box>

      {error !== '' && (
        <Box marginTop={1}>
          <Text color="red">✗ {error}</Text>
        </Box>
      )}

      {step === 'provider' && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Where to create this skill?</Text>
          <Box flexDirection="column" marginTop={1}>
            {providers.map((p, i) => (
              <Box key={p.id} gap={1}>
                <Text color={i === cursor ? 'magenta' : undefined}>
                  {i === cursor ? '❯' : ' '}
                </Text>
                <Text bold={i === cursor} color={i === cursor ? 'white' : undefined} dimColor={i !== cursor}>
                  {p.displayName}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {step === 'name' && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Skill name</Text>
          <Box marginTop={1}>
            <Text color="magenta" bold>❯ </Text>
            <TextInput placeholder="my-skill" onSubmit={handleNameSubmit} />
          </Box>
        </Box>
      )}

      {step === 'description' && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Brief description</Text>
          <Box marginTop={1}>
            <Text color="magenta" bold>❯ </Text>
            <TextInput placeholder="What does this skill do?" onSubmit={handleDescriptionSubmit} />
          </Box>
        </Box>
      )}

      {step === 'creating' && (
        <Box marginTop={1}>
          <Spinner label="Creating skill…" />
        </Box>
      )}

      <Box flexGrow={1} />
      <StatusBar />
    </Box>
  );
}
