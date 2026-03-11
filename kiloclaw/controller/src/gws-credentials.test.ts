import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { writeGwsCredentials, installGwsSkills, type GwsCredentialsDeps } from './gws-credentials';

import fs from 'node:fs';

vi.mock('node:child_process', () => ({
  exec: vi.fn((_cmd: string, cb: (err: Error | null) => void) => cb(null)),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    default: {
      ...actual,
      // Default: marker file not found (ENOENT) — so installGwsSkills proceeds
      accessSync: vi.fn(() => {
        throw new Error('ENOENT');
      }),
      writeFileSync: vi.fn(),
    },
  };
});

function mockDeps() {
  return {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  } satisfies GwsCredentialsDeps;
}

describe('writeGwsCredentials', () => {
  it('writes credential files when both env vars are set', () => {
    const deps = mockDeps();
    const dir = '/tmp/gws-test';
    const env: Record<string, string | undefined> = {
      GOOGLE_CLIENT_SECRET_JSON: '{"client_id":"test"}',
      GOOGLE_CREDENTIALS_JSON: '{"refresh_token":"rt"}',
    };
    const result = writeGwsCredentials(env, dir, deps);

    expect(result).toBe(true);
    expect(deps.mkdirSync).toHaveBeenCalledWith(dir, { recursive: true });
    expect(deps.writeFileSync).toHaveBeenCalledWith(
      path.join(dir, 'client_secret.json'),
      '{"client_id":"test"}',
      { mode: 0o600 }
    );
    expect(deps.writeFileSync).toHaveBeenCalledWith(
      path.join(dir, 'credentials.json'),
      '{"refresh_token":"rt"}',
      { mode: 0o600 }
    );
    expect(env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE).toBe(path.join(dir, 'credentials.json'));
  });

  it('skips when GOOGLE_CLIENT_SECRET_JSON is missing', () => {
    const deps = mockDeps();
    const result = writeGwsCredentials(
      { GOOGLE_CREDENTIALS_JSON: '{"refresh_token":"rt"}' },
      '/tmp/gws-test',
      deps
    );

    expect(result).toBe(false);
    expect(deps.mkdirSync).not.toHaveBeenCalled();
    expect(deps.writeFileSync).not.toHaveBeenCalled();
  });

  it('skips when GOOGLE_CREDENTIALS_JSON is missing', () => {
    const deps = mockDeps();
    const result = writeGwsCredentials(
      { GOOGLE_CLIENT_SECRET_JSON: '{"client_id":"test"}' },
      '/tmp/gws-test',
      deps
    );

    expect(result).toBe(false);
    expect(deps.mkdirSync).not.toHaveBeenCalled();
  });

  it('skips when both env vars are missing', () => {
    const deps = mockDeps();
    const result = writeGwsCredentials({}, '/tmp/gws-test', deps);

    expect(result).toBe(false);
  });

  it('removes stale credential files when env vars are absent', () => {
    const deps = mockDeps();
    const dir = '/tmp/gws-test';
    writeGwsCredentials({}, dir, deps);

    expect(deps.unlinkSync).toHaveBeenCalledWith(path.join(dir, 'client_secret.json'));
    expect(deps.unlinkSync).toHaveBeenCalledWith(path.join(dir, 'credentials.json'));
    expect(deps.unlinkSync).toHaveBeenCalledWith(path.join(dir, 'token_cache.json'));
  });

  it('ignores missing files during cleanup', () => {
    const deps = mockDeps();
    deps.unlinkSync.mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    const dir = '/tmp/gws-test';

    // Should not throw
    const result = writeGwsCredentials({}, dir, deps);
    expect(result).toBe(false);
  });

  it('removes stale token cache when writing fresh credentials', () => {
    const deps = mockDeps();
    const dir = '/tmp/gws-test';
    writeGwsCredentials(
      {
        GOOGLE_CLIENT_SECRET_JSON: '{"client_id":"test"}',
        GOOGLE_CREDENTIALS_JSON: '{"refresh_token":"rt"}',
      },
      dir,
      deps
    );

    expect(deps.unlinkSync).toHaveBeenCalledWith(path.join(dir, 'token_cache.json'));
  });

  it('calls installGwsSkills when credentials are written', async () => {
    const { exec } = await import('node:child_process');
    const deps = mockDeps();
    (exec as unknown as ReturnType<typeof vi.fn>).mockClear();

    writeGwsCredentials(
      {
        GOOGLE_CLIENT_SECRET_JSON: '{"client_id":"test"}',
        GOOGLE_CREDENTIALS_JSON: '{"refresh_token":"rt"}',
      },
      '/tmp/gws-test',
      deps
    );

    expect(exec).toHaveBeenCalledWith(
      'npx -y skills@1.4.4 add https://github.com/googleworkspace/cli --yes --global',
      expect.any(Function)
    );
  });

  it('does not call installGwsSkills when credentials are absent', async () => {
    const { exec } = await import('node:child_process');
    const deps = mockDeps();
    (exec as unknown as ReturnType<typeof vi.fn>).mockClear();

    writeGwsCredentials({}, '/tmp/gws-test', deps);

    expect(exec).not.toHaveBeenCalled();
  });
});

describe('installGwsSkills', () => {
  it('runs npx skills add command when marker file is absent', async () => {
    const { exec } = await import('node:child_process');
    (exec as unknown as ReturnType<typeof vi.fn>).mockClear();
    vi.mocked(fs.accessSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    installGwsSkills();

    expect(exec).toHaveBeenCalledWith(
      'npx -y skills@1.4.4 add https://github.com/googleworkspace/cli --yes --global',
      expect.any(Function)
    );
  });

  it('skips install when marker file exists', async () => {
    const { exec } = await import('node:child_process');
    (exec as unknown as ReturnType<typeof vi.fn>).mockClear();
    vi.mocked(fs.accessSync).mockImplementation(() => undefined);

    installGwsSkills();

    expect(exec).not.toHaveBeenCalled();
  });
});
