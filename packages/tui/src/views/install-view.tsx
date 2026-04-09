import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput, Spinner } from '@inkjs/ui';
import { useAppContext } from '../context/app-context.js';
import type { RemoteSkill } from '@skillpack/core';

type InstallStep = 'source' | 'query' | 'results' | 'provider' | 'installing';

export function InstallView() {
  const { setView, manager, refresh } = useAppContext();
  const [step, setStep] = useState<InstallStep>('source');
  const [selectedSource, setSelectedSource] = useState('');
  const [results, setResults] = useState<RemoteSkill[]>([]);
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedResult, setSelectedResult] = useState<RemoteSkill | null>(null);

  const sources = manager.getSources();
  const providers = manager.getProviders().filter((p) => p.capabilities.canInstall);

  const isTextStep = step === 'query';

  useInput((input, key) => {
    if (key.escape) {
      if (step === 'source') { setView('list'); return; }
      if (step === 'query') { setStep('source'); return; }
      if (step === 'results') { setStep('query'); return; }
      if (step === 'provider') { setStep('results'); return; }
      return;
    }

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
        setSelectedResult(results[cursor]);
        setCursor(0);
        if (providers.length === 1) {
          doInstall(results[cursor].identifier, providers[0].id);
        } else {
          setStep('provider');
        }
      }
      return;
    }

    if (step === 'provider') {
      if (key.downArrow) setCursor((c) => Math.min(c + 1, providers.length - 1));
      if (key.upArrow) setCursor((c) => Math.max(c - 1, 0));
      if (key.return && providers[cursor]) {
        doInstall(selectedResult?.identifier ?? query, providers[cursor].id);
      }
    }
  }, { isActive: !isTextStep });

  const [searching, setSearching] = useState(false);

  const handleQuerySubmit = async (value: string) => {
    setQuery(value);
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

  const doInstall = async (identifier: string, providerId: string) => {
    setStep('installing');
    try {
      await manager.installFromSource(selectedSource, identifier, providerId);
      await refresh();
      setView('list');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep('results');
    }
  };

  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      <Text bold color="cyan">Install Skill</Text>

      {error !== '' && <Text color="red">{error}</Text>}

      {step === 'source' && (
        <Box flexDirection="column" marginY={1}>
          <Text bold>Select source:</Text>
          {sources.map((source, i) => (
            <Text key={source.id} color={i === cursor ? 'cyan' : undefined}>
              {i === cursor ? '> ' : '  '}{source.displayName}
            </Text>
          ))}
        </Box>
      )}

      {step === 'query' && (
        <Box flexDirection="column" marginY={1}>
          <Text bold>Search {selectedSource === 'github' ? 'GitHub (owner/repo or owner/repo@path)' : 'skills.sh'}:</Text>
          {searching ? (
            <Spinner label="Searching..." />
          ) : (
            <Box>
              <Text color="cyan">&gt; </Text>
              <TextInput placeholder={selectedSource === 'github' ? 'owner/repo@skill-path' : 'search keyword...'} onSubmit={handleQuerySubmit} />
            </Box>
          )}
        </Box>
      )}

      {step === 'results' && (
        <Box flexDirection="column" marginY={1}>
          <Text bold>Results:</Text>
          {results.length === 0 ? (
            <Text dimColor>No results found</Text>
          ) : (
            results.map((r, i) => (
              <Box key={r.identifier} gap={1}>
                <Text color={i === cursor ? 'cyan' : undefined}>
                  {i === cursor ? '>' : ' '}
                </Text>
                <Text color={i === cursor ? 'cyan' : 'white'} bold={i === cursor}>
                  {r.name}
                </Text>
                <Text dimColor>{r.description}</Text>
              </Box>
            ))
          )}
        </Box>
      )}

      {step === 'provider' && (
        <Box flexDirection="column" marginY={1}>
          <Text bold>Install to which provider?</Text>
          {providers.map((p, i) => (
            <Text key={p.id} color={i === cursor ? 'cyan' : undefined}>
              {i === cursor ? '> ' : '  '}{p.displayName}
            </Text>
          ))}
        </Box>
      )}

      {step === 'installing' && (
        <Box marginY={1}>
          <Spinner label="Installing..." />
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Esc: back</Text>
      </Box>
    </Box>
  );
}
