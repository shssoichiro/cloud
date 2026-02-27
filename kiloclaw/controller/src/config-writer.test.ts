import { describe, it, expect, vi } from 'vitest';
import { generateBaseConfig, writeBaseConfig, MAX_CONFIG_BACKUPS } from './config-writer';

function fakeDeps(existingConfig?: string) {
  const written: { path: string; data: string }[] = [];
  const copied: { src: string; dest: string }[] = [];
  const renamed: { from: string; to: string }[] = [];
  const unlinked: string[] = [];
  let dirEntries: string[] = [];

  return {
    deps: {
      readFileSync: vi.fn((path: string) => {
        if (path.endsWith('openclaw.json') && existingConfig !== undefined) return existingConfig;
        throw new Error(`ENOENT: no such file: ${path}`);
      }),
      writeFileSync: vi.fn((path: string, data: string) => {
        written.push({ path, data });
      }),
      renameSync: vi.fn((from: string, to: string) => {
        renamed.push({ from, to });
      }),
      copyFileSync: vi.fn((src: string, dest: string) => {
        copied.push({ src, dest });
      }),
      readdirSync: vi.fn(() => dirEntries),
      unlinkSync: vi.fn((path: string) => {
        unlinked.push(path);
      }),
      existsSync: vi.fn((path: string) => {
        if (path.endsWith('openclaw.json')) return existingConfig !== undefined;
        return false;
      }),
    },
    written,
    copied,
    renamed,
    unlinked,
    setDirEntries(entries: string[]) {
      dirEntries = entries;
    },
  };
}

function minimalEnv(): Record<string, string | undefined> {
  return {
    KILOCODE_API_KEY: 'test-api-key',
    OPENCLAW_GATEWAY_TOKEN: 'test-gw-token',
    AUTO_APPROVE_DEVICES: 'true',
  };
}

describe('generateBaseConfig', () => {
  it('generates config with gateway and exec defaults, no kilocode provider entry', () => {
    const { deps } = fakeDeps();
    const config = generateBaseConfig(minimalEnv(), '/tmp/openclaw.json', deps);

    // Gateway
    expect(config.gateway.port).toBe(3001);
    expect(config.gateway.mode).toBe('local');
    expect(config.gateway.bind).toBe('loopback');
    expect(config.gateway.auth.token).toBe('test-gw-token');
    expect(config.gateway.controlUi.allowInsecureAuth).toBe(true);

    // No kilocode provider entry in production — built-in provider takes over
    expect(config.models).toBeUndefined();

    // No default model override when env var not set
    expect(config.agents).toBeUndefined();

    // Exec
    expect(config.tools.exec.host).toBe('gateway');
    expect(config.tools.exec.security).toBe('allowlist');
    expect(config.tools.exec.ask).toBe('on-miss');
  });

  it('preserves existing config keys not touched by the patch', () => {
    const existing = JSON.stringify({ custom: { key: 'value' }, gateway: { extra: true } });
    const { deps } = fakeDeps(existing);
    const config = generateBaseConfig(minimalEnv(), '/tmp/openclaw.json', deps);

    expect(config.custom.key).toBe('value');
    expect(config.gateway.extra).toBe(true);
    expect(config.gateway.port).toBe(3001);
  });

  it('removes stale kilocode provider with /api/openrouter/ baseUrl', () => {
    const existing = JSON.stringify({
      models: {
        providers: {
          kilocode: {
            baseUrl: 'https://api.kilo.ai/api/openrouter/',
            apiKey: 'old-key',
            api: 'openai-completions',
            models: [{ id: 'old/model', name: 'Old' }],
          },
        },
      },
    });
    const { deps } = fakeDeps(existing);
    const config = generateBaseConfig(minimalEnv(), '/tmp/openclaw.json', deps);

    // Stale provider deleted, models object cleaned up
    expect(config.models).toBeUndefined();
  });

  it('removes stale kilocode provider with production /api/gateway/ baseUrl', () => {
    const existing = JSON.stringify({
      models: {
        providers: {
          kilocode: {
            baseUrl: 'https://api.kilo.ai/api/gateway/',
            models: [],
          },
        },
      },
    });
    const { deps } = fakeDeps(existing);
    const config = generateBaseConfig(minimalEnv(), '/tmp/openclaw.json', deps);

    expect(config.models).toBeUndefined();
  });

  it('preserves non-kilocode providers when removing stale kilocode entry', () => {
    const existing = JSON.stringify({
      models: {
        providers: {
          kilocode: {
            baseUrl: 'https://api.kilo.ai/api/openrouter/',
            models: [],
          },
          openai: {
            baseUrl: 'https://api.openai.com/v1',
            models: [{ id: 'gpt-4', name: 'GPT-4' }],
          },
        },
      },
    });
    const { deps } = fakeDeps(existing);
    const config = generateBaseConfig(minimalEnv(), '/tmp/openclaw.json', deps);

    // kilocode removed, openai preserved
    expect(config.models.providers.kilocode).toBeUndefined();
    expect(config.models.providers.openai.baseUrl).toBe('https://api.openai.com/v1');
  });

  it('creates kilocode provider with baseUrl and models: [] when KILOCODE_API_BASE_URL is set', () => {
    const { deps } = fakeDeps();
    const env = { ...minimalEnv(), KILOCODE_API_BASE_URL: 'https://tunnel.example.com/' };
    const config = generateBaseConfig(env, '/tmp/openclaw.json', deps);

    expect(config.models.providers.kilocode.baseUrl).toBe('https://tunnel.example.com/');
    expect(config.models.providers.kilocode.models).toEqual([]);
  });

  it('preserves existing models array when overriding baseUrl', () => {
    const existing = JSON.stringify({
      models: {
        providers: {
          kilocode: {
            baseUrl: 'https://old-tunnel.example.com/',
            models: [{ id: 'kept/model', name: 'Kept' }],
          },
        },
      },
    });
    const { deps } = fakeDeps(existing);
    const env = { ...minimalEnv(), KILOCODE_API_BASE_URL: 'https://new-tunnel.example.com/' };
    const config = generateBaseConfig(env, '/tmp/openclaw.json', deps);

    // baseUrl updated, existing models preserved
    expect(config.models.providers.kilocode.baseUrl).toBe('https://new-tunnel.example.com/');
    expect(config.models.providers.kilocode.models).toEqual([{ id: 'kept/model', name: 'Kept' }]);
  });

  it('overrides default model only when KILOCODE_DEFAULT_MODEL is set', () => {
    const { deps } = fakeDeps();
    const env = { ...minimalEnv(), KILOCODE_DEFAULT_MODEL: 'kilocode/openai/gpt-5' };
    const config = generateBaseConfig(env, '/tmp/openclaw.json', deps);

    expect(config.agents.defaults.model.primary).toBe('kilocode/openai/gpt-5');
  });

  it('does not set default model when KILOCODE_DEFAULT_MODEL is not set', () => {
    const { deps } = fakeDeps();
    const config = generateBaseConfig(minimalEnv(), '/tmp/openclaw.json', deps);

    expect(config.agents).toBeUndefined();
  });

  it('configures allowed origins from env', () => {
    const { deps } = fakeDeps();
    const env = {
      ...minimalEnv(),
      OPENCLAW_ALLOWED_ORIGINS: 'http://localhost:3000, https://claw.kilo.ai',
    };
    const config = generateBaseConfig(env, '/tmp/openclaw.json', deps);

    expect(config.gateway.controlUi.allowedOrigins).toEqual([
      'http://localhost:3000',
      'https://claw.kilo.ai',
    ]);
  });

  it('configures Telegram channel', () => {
    const { deps } = fakeDeps();
    const env = { ...minimalEnv(), TELEGRAM_BOT_TOKEN: 'tg-token-123' };
    const config = generateBaseConfig(env, '/tmp/openclaw.json', deps);

    expect(config.channels.telegram.botToken).toBe('tg-token-123');
    expect(config.channels.telegram.enabled).toBe(true);
    expect(config.channels.telegram.dmPolicy).toBe('pairing');
    expect(config.plugins.entries.telegram.enabled).toBe(true);
  });

  it('configures Telegram with open DM policy and allowFrom wildcard', () => {
    const { deps } = fakeDeps();
    const env = {
      ...minimalEnv(),
      TELEGRAM_BOT_TOKEN: 'tg-token',
      TELEGRAM_DM_POLICY: 'open',
    };
    const config = generateBaseConfig(env, '/tmp/openclaw.json', deps);

    expect(config.channels.telegram.dmPolicy).toBe('open');
    expect(config.channels.telegram.allowFrom).toEqual(['*']);
  });

  it('configures Discord channel', () => {
    const { deps } = fakeDeps();
    const env = { ...minimalEnv(), DISCORD_BOT_TOKEN: 'dc-token-456' };
    const config = generateBaseConfig(env, '/tmp/openclaw.json', deps);

    expect(config.channels.discord.token).toBe('dc-token-456');
    expect(config.channels.discord.enabled).toBe(true);
    expect(config.channels.discord.dm.policy).toBe('pairing');
    expect(config.plugins.entries.discord.enabled).toBe(true);
  });

  it('configures Slack channel when both tokens present', () => {
    const { deps } = fakeDeps();
    const env = {
      ...minimalEnv(),
      SLACK_BOT_TOKEN: 'slack-bot',
      SLACK_APP_TOKEN: 'slack-app',
    };
    const config = generateBaseConfig(env, '/tmp/openclaw.json', deps);

    expect(config.channels.slack.botToken).toBe('slack-bot');
    expect(config.channels.slack.appToken).toBe('slack-app');
    expect(config.channels.slack.enabled).toBe(true);
    expect(config.plugins.entries.slack.enabled).toBe(true);
  });

  it('does not configure Slack when only bot token present', () => {
    const { deps } = fakeDeps();
    const env = { ...minimalEnv(), SLACK_BOT_TOKEN: 'slack-bot' };
    const config = generateBaseConfig(env, '/tmp/openclaw.json', deps);

    expect(config.channels.slack).toBeUndefined();
  });

  it('does not set gateway auth when OPENCLAW_GATEWAY_TOKEN is missing', () => {
    const { deps } = fakeDeps();
    const env = { ...minimalEnv() };
    delete env.OPENCLAW_GATEWAY_TOKEN;
    const config = generateBaseConfig(env, '/tmp/openclaw.json', deps);

    expect(config.gateway.auth).toBeUndefined();
  });
});

describe('writeBaseConfig', () => {
  it('writes via tmp file and renames into place', () => {
    const { deps, written, renamed } = fakeDeps();
    writeBaseConfig(minimalEnv(), '/tmp/openclaw.json', deps);

    // Should write to a hidden tmp file with random suffix, not directly to config path
    expect(written).toHaveLength(1);
    expect(written[0].path).toMatch(/\/tmp\/\.openclaw\.json\.kilotmp\.[0-9a-f]{12}$/);

    // Should rename tmp -> config path
    expect(renamed).toHaveLength(1);
    expect(renamed[0].from).toBe(written[0].path);
    expect(renamed[0].to).toBe('/tmp/openclaw.json');

    // The written data should be valid JSON
    expect(() => JSON.parse(written[0].data)).not.toThrow();
  });

  it('backs up existing config with timestamp before writing', () => {
    const existing = JSON.stringify({ old: true });
    const { deps, copied } = fakeDeps(existing);
    writeBaseConfig(minimalEnv(), '/tmp/openclaw.json', deps);

    expect(copied).toHaveLength(1);
    expect(copied[0].src).toBe('/tmp/openclaw.json');
    // Backup filename: openclaw.json.bak.{ISO timestamp with hyphens instead of colons}
    expect(copied[0].dest).toMatch(/\/tmp\/openclaw\.json\.bak\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-/);
  });

  it('does not back up when no existing config', () => {
    const { deps, copied } = fakeDeps();
    writeBaseConfig(minimalEnv(), '/tmp/openclaw.json', deps);

    expect(copied).toHaveLength(0);
  });

  it('prunes old backups beyond MAX_CONFIG_BACKUPS', () => {
    const existing = JSON.stringify({ old: true });
    const harness = fakeDeps(existing);
    // Simulate 7 existing backup files (sorted lexicographically = chronologically)
    harness.setDirEntries([
      'openclaw.json.bak.2026-02-20T10-00-00.000Z',
      'openclaw.json.bak.2026-02-21T10-00-00.000Z',
      'openclaw.json.bak.2026-02-22T10-00-00.000Z',
      'openclaw.json.bak.2026-02-23T10-00-00.000Z',
      'openclaw.json.bak.2026-02-24T10-00-00.000Z',
      'openclaw.json.bak.2026-02-25T10-00-00.000Z',
      'openclaw.json.bak.2026-02-26T10-00-00.000Z',
    ]);

    writeBaseConfig(minimalEnv(), '/tmp/openclaw.json', harness.deps);

    // Should prune the 2 oldest (7 - MAX_CONFIG_BACKUPS = 2)
    expect(harness.unlinked).toHaveLength(7 - MAX_CONFIG_BACKUPS);
    expect(harness.unlinked[0]).toBe('/tmp/openclaw.json.bak.2026-02-20T10-00-00.000Z');
    expect(harness.unlinked[1]).toBe('/tmp/openclaw.json.bak.2026-02-21T10-00-00.000Z');
  });

  it('does not prune when fewer backups than MAX_CONFIG_BACKUPS', () => {
    const existing = JSON.stringify({ old: true });
    const harness = fakeDeps(existing);
    harness.setDirEntries([
      'openclaw.json.bak.2026-02-25T10-00-00.000Z',
      'openclaw.json.bak.2026-02-26T10-00-00.000Z',
    ]);

    writeBaseConfig(minimalEnv(), '/tmp/openclaw.json', harness.deps);

    expect(harness.unlinked).toHaveLength(0);
  });

  it('ignores non-backup files in the directory', () => {
    const existing = JSON.stringify({ old: true });
    const harness = fakeDeps(existing);
    harness.setDirEntries([
      'openclaw.json',
      'openclaw.json.bak.2026-02-26T10-00-00.000Z',
      'openclaw.json.tmp',
      'unrelated.txt',
    ]);

    writeBaseConfig(minimalEnv(), '/tmp/openclaw.json', harness.deps);

    expect(harness.unlinked).toHaveLength(0);
  });

  it('continues if backup pruning fails', () => {
    const existing = JSON.stringify({ old: true });
    const harness = fakeDeps(existing);
    harness.deps.readdirSync.mockImplementation(() => {
      throw new Error('permission denied');
    });

    // Should not throw — pruning failure is non-fatal
    const config = writeBaseConfig(minimalEnv(), '/tmp/openclaw.json', harness.deps);
    expect(config.gateway.port).toBe(3001);
    expect(harness.written).toHaveLength(1);
    expect(harness.renamed).toHaveLength(1);
  });

  it('cleans up tmp file if rename fails', () => {
    const harness = fakeDeps();
    harness.deps.renameSync.mockImplementation(() => {
      throw new Error('EXDEV: cross-device link');
    });

    expect(() => writeBaseConfig(minimalEnv(), '/tmp/openclaw.json', harness.deps)).toThrow(
      'EXDEV'
    );

    // Tmp file should have been written then cleaned up
    expect(harness.written).toHaveLength(1);
    expect(harness.unlinked).toHaveLength(1);
    expect(harness.unlinked[0]).toBe(harness.written[0].path);
  });

  it('cleans up tmp file if writeFileSync fails', () => {
    const harness = fakeDeps();
    harness.deps.writeFileSync.mockImplementation(() => {
      throw new Error('ENOSPC: no space left on device');
    });

    expect(() => writeBaseConfig(minimalEnv(), '/tmp/openclaw.json', harness.deps)).toThrow(
      'ENOSPC'
    );

    // unlinkSync called for cleanup (may fail since file wasn't created, but that's caught)
    expect(harness.renamed).toHaveLength(0);
  });

  it('returns the generated config object', () => {
    const { deps } = fakeDeps();
    const config = writeBaseConfig(minimalEnv(), '/tmp/openclaw.json', deps);

    expect(config.gateway.port).toBe(3001);
    expect(config.tools.exec.host).toBe('gateway');
  });
});
