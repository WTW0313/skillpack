import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput, Spinner } from '@inkjs/ui';
import { useAppContext } from '../context/app-context.js';
import { StatusBar } from '../components/status-bar.js';
import type { RemoteSkill } from '@skillpack/core';

type InstallStep = 'source' | 'query' | 'results' | 'installing';

export function InstallView() {
  const { setView, manager, refresh } = useAppContext();
  const [step, setStep] = useState<InstallStep>('source');
  const [selectedSource, setSelectedSource] = useState('');
  const [results, setResults] = useState<RemoteSkill[]>([]);
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);

  const sources = manager.getSources();

  useInput((_input, key) => {
    if (key.escape) {
      if (step === 'source') { setView('list'); return; }
      if (step === 'query') { setStep('source'); return; }
      if (step === 'results') { setStep('query'); return; }
      return;
    }

    if (step === 'query') return;

    if (step === 'source') {
      if (key.downArrow) setCursor((c) => Math.min(c + 1, sources.length - 1));
      if (key.upArrow) setCursor((c) => Math.max(c - 1, 0));
      if (key.return && sources[cursor]) {
        setSelectedSource(sources[cursor].id);
        setCursor(0);
        setStep('query');
      }
      return;
    }

    if (step === 'results') {
      if (key.downArrow) setCursor((c) => Math.min(c + 1, results.length - 1));
      if (key.upArrow) setCursor((c) => Math.max(c - 1, 0));
      if (key.return && results[cursor]) {
        doInstall(results[cursor].identifier);
      }
    }
  });

  const handleQuerySubmit = async (value: string) => {
    setError('');
    setSearching(true);
    try {
      const found = await manager.searchRemote(selectedSource, value);
      setResults(found);
      setCursor(0);
      if (found.length === 0) {
        setError(`No results for "${value}"`);
      }
      setStep('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  };

  const doInstall = async (identifier: string) => {
    setStep('installing');
    try {
      await manager.installFromSource(selectedSource, identifier, 'global');
      await refresh();
      setView('list');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep('results');
    }
  };

  const stepLabels = ['source', 'query', 'results'];
  const currentStepIdx = stepLabels.indexOf(step === 'installing' ? 'results' : step);

  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      {/* Header */}
      <Box>
        <Text dimColor>‹ esc  </Text>
        <Text bold color="magenta">Install Skill</Text>
      </Box>

      {/* Progress breadcrumb */}
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
        <Box marginTop={1} flexDirection="column">
          <Text color="red">✗ {error.split('\n').slice(0, 4).join('\n')}</Text>
        </Box>
      )}

      {step === 'source' && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Where to search?</Text>
          <Box flexDirection="column" marginTop={1}>
            {sources.map((source, i) => (
              <Box key={source.id} gap={1}>
                <Text color={i === cursor ? 'magenta' : undefined}>
                  {i === cursor ? '❯' : ' '}
                </Text>
                <Text bold={i === cursor} color={i === cursor ? 'white' : undefined} dimColor={i !== cursor}>
                  {source.displayName}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {step === 'query' && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>
            {selectedSource === 'github' ? 'Enter owner/repo or owner/repo@path' : 'Search skills.sh'}
          </Text>
          {searching ? (
            <Box marginTop={1}><Spinner label="Searching…" /></Box>
          ) : (
            <Box marginTop={1}>
              <Text color="magenta" bold>❯ </Text>
              <TextInput
                placeholder={selectedSource === 'github' ? 'owner/repo@skill-path' : 'search keyword…'}
                onSubmit={handleQuerySubmit}
              />
            </Box>
          )}
        </Box>
      )}

      {step === 'results' && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>{results.length} result{results.length !== 1 ? 's' : ''}</Text>
          <Box flexDirection="column" marginTop={1}>
            {results.length === 0 ? (
              <Text dimColor>Nothing found. Press esc to try again.</Text>
            ) : (
              results.map((r, i) => (
                <Box key={r.identifier} gap={1}>
                  <Text color={i === cursor ? 'magenta' : undefined}>
                    {i === cursor ? '❯' : ' '}
                  </Text>
                  <Text bold={i === cursor} color={i === cursor ? 'white' : undefined} dimColor={i !== cursor}>
                    {r.name}
                  </Text>
                  {r.description && <Text dimColor> {r.description}</Text>}
                </Box>
              ))
            )}
          </Box>
        </Box>
      )}

      {step === 'installing' && (
        <Box marginTop={1}>
          <Spinner label="Installing…" />
        </Box>
      )}

      <Box flexGrow={1} />
      <StatusBar />
    </Box>
  );
}
