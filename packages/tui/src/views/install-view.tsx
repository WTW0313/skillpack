import { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput, Spinner } from '@inkjs/ui';
import { useAppContext } from '../context/app-context.js';
import { StatusBar } from '../components/status-bar.js';
import { useTerminalSize } from '../hooks/use-terminal-size.js';
import { fitCell, getBoundedContentLayout, getGlyphSet } from '../lib/responsive-layout.js';
import type { RemoteSkill } from '@skillpack/core';

type InstallStep = 'query' | 'results' | 'installing';

export function InstallView() {
  const { setView, manager, refresh } = useAppContext();
  const [step, setStep] = useState<InstallStep>('query');
  const [results, setResults] = useState<RemoteSkill[]>([]);
  const [cursor, setCursor] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const glyphs = getGlyphSet();
  const { columns, rows } = useTerminalSize();
  const layout = getBoundedContentLayout({
    size: { columns, rows },
    fullChromeLines: error ? 8 : 6,
    compactChromeLines: error ? 6 : 4,
  });
  const resultRows = Math.max(1, layout.visibleRows - 2);
  const resultNameWidth = Math.max(12, Math.min(30, columns - 22));

  useEffect(() => {
    if (cursor < scrollOffset) {
      setScrollOffset(cursor);
    } else if (cursor >= scrollOffset + resultRows) {
      setScrollOffset(cursor - resultRows + 1);
    }
  }, [cursor, resultRows, scrollOffset]);

  const visibleResults = useMemo(
    () => results.slice(scrollOffset, scrollOffset + resultRows),
    [results, scrollOffset, resultRows],
  );

  useInput((_input, key) => {
    if (key.escape) {
      if (step === 'query') {
        setView('list');
        return;
      }
      if (step === 'results') {
        setStep('query');
        return;
      }
      return;
    }

    if (step === 'query') return;

    if (step === 'results') {
      if (key.downArrow) setCursor((c) => Math.min(c + 1, Math.max(0, results.length - 1)));
      if (key.upArrow) setCursor((c) => Math.max(c - 1, 0));
      if (key.return && results[cursor]) {
        doInstall(results[cursor].identifier).catch((err) => {
          setError(err instanceof Error ? err.message : String(err));
          setStep('results');
        });
      }
    }
  });

  const handleQuerySubmit = async (value: string) => {
    setError('');
    setSearching(true);
    try {
      const found = await manager.searchRemote('skillssh', value);
      setResults(found);
      setCursor(0);
      setScrollOffset(0);
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
    await manager.installFromSource('skillssh', identifier, 'global');
    await refresh();
    setView('list');
  };

  const stepLabels = ['query', 'results'];
  const currentStepIdx = stepLabels.indexOf(step === 'installing' ? 'results' : step);

  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      {/* Header */}
      <Box>
        <Text dimColor>‹ esc{'  '}</Text>
        <Text bold color="magenta">
          Install Skill
        </Text>
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

      {step === 'query' && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Search skills.sh</Text>
          {searching ? (
            <Box marginTop={1}>
              <Spinner label="Searching…" />
            </Box>
          ) : (
            <Box marginTop={1}>
              <Text color="magenta" bold>
                {glyphs.selected}{' '}
              </Text>
              <TextInput placeholder="search keyword…" onSubmit={handleQuerySubmit} />
            </Box>
          )}
        </Box>
      )}

      {step === 'results' && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>
            {results.length} result{results.length !== 1 ? 's' : ''}
          </Text>
          <Box flexDirection="column" marginTop={1} height={resultRows}>
            {results.length === 0 ? (
              <Text dimColor>Nothing found. Press esc to try again.</Text>
            ) : (
              visibleResults.map((r, i) => {
                const absoluteIndex = scrollOffset + i;
                return (
                  <Box key={r.identifier} gap={1}>
                    <Text color={absoluteIndex === cursor ? 'magenta' : undefined}>
                      {absoluteIndex === cursor ? glyphs.selected : ' '}
                    </Text>
                    <Text
                      bold={absoluteIndex === cursor}
                      color={absoluteIndex === cursor ? 'white' : undefined}
                      dimColor={absoluteIndex !== cursor}
                    >
                      {fitCell(r.name, resultNameWidth)}
                    </Text>
                    {r.description && (
                      <Text dimColor wrap="truncate">
                        {' '}
                        {r.description}
                      </Text>
                    )}
                  </Box>
                );
              })
            )}
          </Box>
          {results.length > resultRows && (
            <Text dimColor>
              {scrollOffset + 1}-{Math.min(scrollOffset + resultRows, results.length)} of {results.length}
            </Text>
          )}
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
