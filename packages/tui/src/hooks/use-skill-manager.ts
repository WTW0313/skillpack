import { useState, useEffect } from 'react';
import {
  SkillManager, ConfigManager,
  CodexProvider, CursorProvider, ClaudeProvider, SkillsShProvider,
  GitHubSource, SkillsShSource,
} from '@skillpack/core';

export function useSkillManager(): { manager: SkillManager | null; error: string | null } {
  const [manager, setManager] = useState<SkillManager | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const configManager = new ConfigManager();
        const config = await configManager.load();
        const mgr = new SkillManager();

        const providerFactories: Record<string, () => InstanceType<typeof CodexProvider | typeof CursorProvider | typeof ClaudeProvider | typeof SkillsShProvider>> = {
          codex: () => new CodexProvider(config.providers.codex?.paths),
          cursor: () => new CursorProvider(config.providers.cursor?.paths),
          claude: () => new ClaudeProvider(config.providers.claude?.paths),
          skillssh: () => new SkillsShProvider(config.providers.skillssh?.paths),
        };

        for (const [id, factory] of Object.entries(providerFactories)) {
          if (config.providers[id]?.enabled) {
            mgr.registerProvider(factory());
          }
        }

        if (config.sources.github?.enabled) mgr.registerSource(new GitHubSource());
        if (config.sources.skillssh?.enabled) mgr.registerSource(new SkillsShSource());

        await mgr.scanAll();

        if (!cancelled) setManager(mgr);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  return { manager, error };
}
