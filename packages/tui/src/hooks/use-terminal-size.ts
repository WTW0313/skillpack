import { createContext, createElement, useContext, useState, useEffect, type ReactNode } from 'react';
import { useStdout } from 'ink';
import type { TerminalSize } from '../lib/responsive-layout.js';

const TerminalSizeOverrideContext = createContext<TerminalSize | null>(null);

export function TerminalSizeProvider({ size, children }: { size: TerminalSize; children: ReactNode }) {
  return createElement(TerminalSizeOverrideContext.Provider, { value: size }, children);
}

export function useTerminalSize() {
  const override = useContext(TerminalSizeOverrideContext);
  const { stdout } = useStdout();
  const [size, setSize] = useState({
    columns: stdout?.columns ?? 80,
    rows: stdout?.rows ?? 24,
  });

  useEffect(() => {
    if (!stdout) return;
    const onResize = () => {
      setSize({ columns: stdout.columns, rows: stdout.rows });
    };
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);

  return override ?? size;
}
