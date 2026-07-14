import { useState, useEffect } from 'react';
import {
  SkillManager,
  ConfigManager,
  CodexProvider,
  ClaudeProvider,
  GlobalProvider,
  SkillsShSource,
  type SkillpackConfig,
} from '@skillpack/core';

export interface SkillManagerResult {
  manager: SkillManager | null;
  config: SkillpackConfig | null;
  error: string | null;
  setUsageImportConsent: (importConsent: boolean) => Promise<SkillpackConfig>;
}

export function useSkillManager(): SkillManagerResult {
  const [manager, setManager] = useState<SkillManager | null>(null);
  const [config, setConfig] = useState<SkillpackConfig | null>(null);
  const [configManager, setConfigManager] = useState<ConfigManager | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const configManager = new ConfigManager();
      const cfg = await configManager.load();
      const mgr = new SkillManager({
        usageProviders: [
          {
            provider: 'codex',
            displayName: 'Codex',
            supported: true,
            artifactRoots: cfg.usage.artifactRoots.codex ?? [],
          },
          {
            provider: 'claude',
            displayName: 'Claude',
            supported: true,
            artifactRoots: cfg.usage.artifactRoots.claude ?? [],
            skillRoots: cfg.providers.claude?.paths ?? [],
          },
        ],
      });

      const providerFactories: Record<
        string,
        () => InstanceType<typeof CodexProvider | typeof ClaudeProvider | typeof GlobalProvider>
      > = {
        codex: () => new CodexProvider(cfg.providers.codex?.paths),
        claude: () => {
          const allPaths = cfg.providers.claude?.paths ?? [];
          const cachePaths = allPaths.filter((p) => p.includes('plugins') || p.includes('cache'));
          const flatPaths = allPaths.filter((p) => !p.includes('plugins') && !p.includes('cache'));
          return new ClaudeProvider(
            cachePaths.length > 0 ? cachePaths : undefined,
            flatPaths.length > 0 ? flatPaths : undefined,
          );
        },
        global: () => new GlobalProvider(cfg.providers.global?.paths),
      };

      for (const [id, factory] of Object.entries(providerFactories)) {
        if (cfg.providers[id]?.enabled) {
          mgr.registerProvider(factory());
        }
      }

      if (cfg.sources.skillssh?.enabled) mgr.registerSource(new SkillsShSource());

      await mgr.init();
      await mgr.scanAll(process.cwd(), cfg.projectSkillsDirs);

      if (!cancelled) {
        setManager(mgr);
        setConfig(cfg);
        setConfigManager(configManager);
      }
    }

    init().catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function setUsageImportConsent(importConsent: boolean): Promise<SkillpackConfig> {
    if (!configManager) throw new Error('Config manager is not ready');
    const nextConfig = await configManager.setUsageImportConsent(importConsent);
    setConfig(nextConfig);
    return nextConfig;
  }

  return { manager, config, error, setUsageImportConsent };
}
