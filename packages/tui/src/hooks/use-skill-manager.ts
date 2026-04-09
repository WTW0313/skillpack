import { useState, useEffect } from 'react';
import {
  SkillManager, ConfigManager,
  CodexProvider, CursorProvider, ClaudeProvider, SkillsShProvider,
  GitHubSource, SkillsShSource,
  type SkillpackConfig,
} from '@skillpack/core';

export interface SkillManagerResult {
  manager: SkillManager | null;
  config: SkillpackConfig | null;
  error: string | null;
}

export function useSkillManager(): SkillManagerResult {
  const [manager, setManager] = useState<SkillManager | null>(null);
  const [config, setConfig] = useState<SkillpackConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const configManager = new ConfigManager();
        const cfg = await configManager.load();
        const mgr = new SkillManager();

        const providerFactories: Record<string, () => InstanceType<typeof CodexProvider | typeof CursorProvider | typeof ClaudeProvider | typeof SkillsShProvider>> = {
          codex: () => new CodexProvider(cfg.providers.codex?.paths),
          cursor: () => new CursorProvider(cfg.providers.cursor?.paths),
          claude: () => {
            const allPaths = cfg.providers.claude?.paths ?? [];
            const cachePaths = allPaths.filter((p) => p.includes('plugins') || p.includes('cache'));
            const flatPaths = allPaths.filter((p) => !p.includes('plugins') && !p.includes('cache'));
            return new ClaudeProvider(
              cachePaths.length > 0 ? cachePaths : undefined,
              flatPaths.length > 0 ? flatPaths : undefined,
            );
          },
          skillssh: () => new SkillsShProvider(cfg.providers.skillssh?.paths),
        };

        for (const [id, factory] of Object.entries(providerFactories)) {
          if (cfg.providers[id]?.enabled) {
            mgr.registerProvider(factory());
          }
        }

        if (cfg.sources.github?.enabled) mgr.registerSource(new GitHubSource());
        if (cfg.sources.skillssh?.enabled) mgr.registerSource(new SkillsShSource());

        await mgr.init();
        await mgr.scanAll(process.cwd(), cfg.projectSkillsDir);

        if (!cancelled) {
          setManager(mgr);
          setConfig(cfg);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  return { manager, config, error };
}
