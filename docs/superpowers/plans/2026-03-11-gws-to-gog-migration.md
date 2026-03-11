# gws → gog CLI Migration Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Google Workspace CLI (gws) with gogcli (gog) as the sole Google CLI in KiloClaw, and rewrite the setup flow to use gcloud + gog directly.

**Architecture:** The controller writes gog-format credentials (plain JSON client config + JWE-encrypted keyring token) at startup. The setup container uses gcloud for project/API setup and prompts for manual OAuth client creation (the only step Google doesn't expose an API for), then runs a custom OAuth flow and stores encrypted credentials. No gws dependency anywhere.

**Tech Stack:** Node.js, jose (JWE encryption), gcloud CLI, gog (Go CLI), Vitest

---

## Context for implementers

### Project structure

```
kiloclaw/
  Dockerfile                          # Main container image
  controller/
    package.json                      # Dependencies (hono, will add jose)
    src/
      index.ts                        # Controller entry — calls writeGwsCredentials()
      gws-credentials.ts             # Current credential writer (being replaced)
      gws-credentials.test.ts        # Tests (being replaced)
  google-setup/
    Dockerfile                        # Setup image (has gws + gcloud)
    setup.mjs                         # Setup script (uses gws auth setup)
    package.json
    README.md
  test/                               # E2E tests (being renamed to e2e/)
    google-credentials-integration.mjs
    google-setup-e2e.mjs
    docker-image-testing.md
  src/
    gateway/env.ts                    # Decrypts credentials → GOOGLE_CLIENT_SECRET_JSON + GOOGLE_CREDENTIALS_JSON env vars
    gateway/env.test.ts               # Tests for env decryption
    routes/api.ts                     # User-facing google-credentials routes
    routes/platform.ts                # Internal google-credentials routes
```

### Key env vars (unchanged by this migration)

- `GOOGLE_CLIENT_SECRET_JSON` — JSON with `{client_id, client_secret}` (from `installed` wrapper)
- `GOOGLE_CREDENTIALS_JSON` — JSON with `{type, refresh_token, client_id, client_secret, scopes, ...}`

These env vars are set by `kiloclaw/src/gateway/env.ts` (the worker side). The controller reads them and writes files for whichever CLI to discover. The env var names do NOT change.

### gog credential format

gog expects:
1. **Client config**: `~/.config/gogcli/credentials.json` — plain JSON `{client_id, client_secret}`
2. **Refresh token**: `~/.config/gogcli/keyring/<percent-encoded-key>` — JWE-encrypted file
   - Key name: `token:default:<email>` → filename: `token%3Adefault%3A<percent-encoded-email>`
   - JWE algorithm: `PBES2-HS256+A128KW` (key wrapping) + `A256GCM` (content encryption)
   - Password: from `GOG_KEYRING_PASSWORD` env var (empty string is valid)
   - Payload: `{RefreshToken: string, Services: string[], Scopes: string[], CreatedAt: string}`

### gog env vars

- `GOG_KEYRING_BACKEND=file` — use file-based keyring (not OS keychain)
- `GOG_KEYRING_PASSWORD=""` — password for file keyring encryption (empty is supported)
- `GOG_ACCOUNT=<email>` — default account to use

### Scopes (full set)

```js
const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/gmail.settings.sharing',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/contacts.other.readonly',
  'https://www.googleapis.com/auth/directory.readonly',
  'https://www.googleapis.com/auth/forms.body',
  'https://www.googleapis.com/auth/forms.responses.readonly',
  'https://www.googleapis.com/auth/chat.spaces',
  'https://www.googleapis.com/auth/chat.messages',
  'https://www.googleapis.com/auth/chat.memberships',
  'https://www.googleapis.com/auth/classroom.courses',
  'https://www.googleapis.com/auth/classroom.rosters',
  'https://www.googleapis.com/auth/script.projects',
  'https://www.googleapis.com/auth/script.deployments',
  'https://www.googleapis.com/auth/keep',
  'https://www.googleapis.com/auth/pubsub',
];
```

### APIs to enable

```
gmail.googleapis.com calendar-json.googleapis.com drive.googleapis.com
docs.googleapis.com slides.googleapis.com sheets.googleapis.com
tasks.googleapis.com people.googleapis.com forms.googleapis.com
chat.googleapis.com classroom.googleapis.com script.googleapis.com
keep.googleapis.com pubsub.googleapis.com
```

### Commands

- **Controller tests**: `cd kiloclaw/controller && npx vitest run`
- **Worker tests**: `cd kiloclaw && pnpm test`
- **Format changed files**: `pnpm run format:changed` (from repo root)

---

## Chunk 1: Controller — gog credential writer

### Task 1: Add jose dependency to controller

**Files:**
- Modify: `kiloclaw/controller/package.json`

- [ ] **Step 1: Add jose dependency**

```json
{
  "name": "kiloclaw-controller",
  "private": true,
  "type": "module",
  "dependencies": {
    "hono": "4.12.2",
    "jose": "6.0.11"
  },
  "devDependencies": {
    "@types/node": "22.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd kiloclaw/controller && bun install`
Expected: bun.lock updated, jose installed

- [ ] **Step 3: Commit**

```bash
git add kiloclaw/controller/package.json kiloclaw/controller/bun.lock
git commit -m "chore(kiloclaw): add jose dependency to controller for JWE keyring"
```

### Task 2: Write failing tests for gog-credentials

**Files:**
- Create: `kiloclaw/controller/src/gog-credentials.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';

// We'll import from gog-credentials once it exists.
// For now, these tests define the expected behavior.

// No child_process mock needed — gog-credentials doesn't shell out

function mockDeps() {
  return {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
}

// Credentials JSON that includes email (new requirement for gog)
const CLIENT_SECRET_JSON = JSON.stringify({
  installed: {
    client_id: 'test-client-id.apps.googleusercontent.com',
    client_secret: 'GOCSPX-test-secret',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
  },
});

const CREDENTIALS_JSON = JSON.stringify({
  type: 'authorized_user',
  client_id: 'test-client-id.apps.googleusercontent.com',
  client_secret: 'GOCSPX-test-secret',
  refresh_token: '1//0test-refresh-token',
  scopes: ['https://www.googleapis.com/auth/gmail.modify'],
  email: 'user@gmail.com',
});

describe('writeGogCredentials', () => {
  let writeGogCredentials: typeof import('./gog-credentials').writeGogCredentials;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('./gog-credentials');
    writeGogCredentials = mod.writeGogCredentials;
  });

  it('writes client credentials and keyring when both env vars are set', async () => {
    const deps = mockDeps();
    const dir = '/tmp/gogcli-test';
    const env: Record<string, string | undefined> = {
      GOOGLE_CLIENT_SECRET_JSON: CLIENT_SECRET_JSON,
      GOOGLE_CREDENTIALS_JSON: CREDENTIALS_JSON,
    };
    const result = await writeGogCredentials(env, dir, deps);

    expect(result).toBe(true);
    expect(deps.mkdirSync).toHaveBeenCalledWith(dir, { recursive: true });
    expect(deps.mkdirSync).toHaveBeenCalledWith(path.join(dir, 'keyring'), { recursive: true });

    // Should write credentials.json with just client_id + client_secret
    const credentialsCall = deps.writeFileSync.mock.calls.find(
      (c: unknown[]) => c[0] === path.join(dir, 'credentials.json')
    );
    expect(credentialsCall).toBeDefined();
    const writtenCreds = JSON.parse(credentialsCall![1] as string);
    expect(writtenCreds).toEqual({
      client_id: 'test-client-id.apps.googleusercontent.com',
      client_secret: 'GOCSPX-test-secret',
    });

    // Should write a keyring file with percent-encoded name
    const keyringCall = deps.writeFileSync.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes('keyring/')
    );
    expect(keyringCall).toBeDefined();
    const keyringPath = keyringCall![0] as string;
    expect(keyringPath).toContain('token%3Adefault%3Auser%40gmail.com');

    // Keyring file should be a JWE string (starts with eyJ)
    const keyringContent = keyringCall![1] as string;
    expect(keyringContent).toMatch(/^eyJ/);
  });

  it('sets GOG env vars when credentials are written', async () => {
    const deps = mockDeps();
    const env: Record<string, string | undefined> = {
      GOOGLE_CLIENT_SECRET_JSON: CLIENT_SECRET_JSON,
      GOOGLE_CREDENTIALS_JSON: CREDENTIALS_JSON,
    };
    await writeGogCredentials(env, '/tmp/gogcli-test', deps);

    expect(env.GOG_KEYRING_BACKEND).toBe('file');
    expect(env.GOG_KEYRING_PASSWORD).toBe('');
    expect(env.GOG_ACCOUNT).toBe('user@gmail.com');
  });

  it('does NOT set GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE', async () => {
    const deps = mockDeps();
    const env: Record<string, string | undefined> = {
      GOOGLE_CLIENT_SECRET_JSON: CLIENT_SECRET_JSON,
      GOOGLE_CREDENTIALS_JSON: CREDENTIALS_JSON,
    };
    await writeGogCredentials(env, '/tmp/gogcli-test', deps);

    expect(env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE).toBeUndefined();
  });

  it('skips when GOOGLE_CLIENT_SECRET_JSON is missing', async () => {
    const deps = mockDeps();
    const result = await writeGogCredentials(
      { GOOGLE_CREDENTIALS_JSON: CREDENTIALS_JSON },
      '/tmp/gogcli-test',
      deps
    );
    expect(result).toBe(false);
    expect(deps.mkdirSync).not.toHaveBeenCalled();
  });

  it('skips when GOOGLE_CREDENTIALS_JSON is missing', async () => {
    const deps = mockDeps();
    const result = await writeGogCredentials(
      { GOOGLE_CLIENT_SECRET_JSON: CLIENT_SECRET_JSON },
      '/tmp/gogcli-test',
      deps
    );
    expect(result).toBe(false);
  });

  it('removes stale credential files when env vars are absent', async () => {
    const deps = mockDeps();
    const dir = '/tmp/gogcli-test';
    await writeGogCredentials({}, dir, deps);

    expect(deps.unlinkSync).toHaveBeenCalledWith(path.join(dir, 'credentials.json'));
  });

  it('ignores missing files during cleanup', async () => {
    const deps = mockDeps();
    deps.unlinkSync.mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    const result = await writeGogCredentials({}, '/tmp/gogcli-test', deps);
    expect(result).toBe(false);
  });

  it('handles "web" client config wrapper', async () => {
    const deps = mockDeps();
    const webClientSecret = JSON.stringify({
      web: {
        client_id: 'web-client-id.apps.googleusercontent.com',
        client_secret: 'GOCSPX-web-secret',
      },
    });
    const env: Record<string, string | undefined> = {
      GOOGLE_CLIENT_SECRET_JSON: webClientSecret,
      GOOGLE_CREDENTIALS_JSON: CREDENTIALS_JSON,
    };
    await writeGogCredentials(env, '/tmp/gogcli-test', deps);

    const credentialsCall = deps.writeFileSync.mock.calls.find(
      (c: unknown[]) => c[0] === path.join('/tmp/gogcli-test', 'credentials.json')
    );
    const writtenCreds = JSON.parse(credentialsCall![1] as string);
    expect(writtenCreds.client_id).toBe('web-client-id.apps.googleusercontent.com');
    expect(writtenCreds.client_secret).toBe('GOCSPX-web-secret');
  });

  it('percent-encodes special characters in email for keyring filename', async () => {
    const deps = mockDeps();
    const credsWithPlus = JSON.stringify({
      type: 'authorized_user',
      client_id: 'test-client-id.apps.googleusercontent.com',
      client_secret: 'GOCSPX-test-secret',
      refresh_token: '1//0test-refresh-token',
      scopes: ['https://www.googleapis.com/auth/gmail.modify'],
      email: 'user+tag@gmail.com',
    });
    const env: Record<string, string | undefined> = {
      GOOGLE_CLIENT_SECRET_JSON: CLIENT_SECRET_JSON,
      GOOGLE_CREDENTIALS_JSON: credsWithPlus,
    };
    await writeGogCredentials(env, '/tmp/gogcli-test', deps);

    const keyringCall = deps.writeFileSync.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes('keyring/')
    );
    const keyringPath = keyringCall![0] as string;
    // + must be percent-encoded as %2B
    expect(keyringPath).toContain('user%2Btag%40gmail.com');
  });

  it('handles credentials without email gracefully', async () => {
    const deps = mockDeps();
    const credsNoEmail = JSON.stringify({
      type: 'authorized_user',
      client_id: 'test-client-id.apps.googleusercontent.com',
      client_secret: 'GOCSPX-test-secret',
      refresh_token: '1//0test-refresh-token',
      scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    });
    const env: Record<string, string | undefined> = {
      GOOGLE_CLIENT_SECRET_JSON: CLIENT_SECRET_JSON,
      GOOGLE_CREDENTIALS_JSON: credsNoEmail,
    };

    // Should still write client credentials but skip keyring (no email = can't create key name)
    const result = await writeGogCredentials(env, '/tmp/gogcli-test', deps);
    expect(result).toBe(true);

    // Client credentials should still be written
    const credentialsCall = deps.writeFileSync.mock.calls.find(
      (c: unknown[]) => c[0] === path.join('/tmp/gogcli-test', 'credentials.json')
    );
    expect(credentialsCall).toBeDefined();

    // Keyring file should NOT be written (no email)
    const keyringCall = deps.writeFileSync.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes('keyring/')
    );
    expect(keyringCall).toBeUndefined();

    // GOG_ACCOUNT should not be set
    expect(env.GOG_ACCOUNT).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd kiloclaw/controller && npx vitest run src/gog-credentials.test.ts`
Expected: FAIL — module `./gog-credentials` not found

### Task 3: Implement gog-credentials module

**Files:**
- Create: `kiloclaw/controller/src/gog-credentials.ts`

- [ ] **Step 1: Write the implementation**

```typescript
/**
 * Writes gogcli credential files to disk so the gog CLI picks them up
 * automatically at runtime.
 *
 * When the container starts with GOOGLE_CLIENT_SECRET_JSON and
 * GOOGLE_CREDENTIALS_JSON env vars, this module:
 * 1. Writes client credentials to ~/.config/gogcli/credentials.json
 * 2. Writes a JWE-encrypted keyring file with the refresh token
 * 3. Sets GOG_KEYRING_BACKEND, GOG_KEYRING_PASSWORD, GOG_ACCOUNT env vars
 */
import { CompactEncrypt } from 'jose';
import path from 'node:path';

// Use /root explicitly — OpenClaw changes HOME to the workspace dir at runtime,
// but we need credentials at a stable, absolute path that gog can always find.
const GOG_CONFIG_DIR = '/root/.config/gogcli';
const CREDENTIALS_FILE = 'credentials.json';
const KEYRING_DIR = 'keyring';

export type GogCredentialsDeps = {
  mkdirSync: (dir: string, opts: { recursive: boolean }) => void;
  writeFileSync: (path: string, data: string, opts: { mode: number }) => void;
  unlinkSync: (path: string) => void;
};

/**
 * Percent-encode a string for use as a keyring filename.
 * gog uses Go's url.PathEscape which encodes everything except unreserved chars.
 */
function percentEncode(s: string): string {
  return Array.from(new TextEncoder().encode(s))
    .map(b => {
      const c = String.fromCharCode(b);
      if (/[A-Za-z0-9\-_.~]/.test(c)) return c;
      return '%' + b.toString(16).toUpperCase().padStart(2, '0');
    })
    .join('');
}

/**
 * Create a JWE-encrypted keyring file matching the 99designs/keyring file backend.
 * Uses PBES2-HS256+A128KW for key wrapping and A256GCM for content encryption.
 */
async function createKeyringEntry(
  refreshToken: string,
  scopes: string[],
  password: string
): Promise<string> {
  // Map OAuth scopes to gog service names for the Services field
  const services = mapScopesToServices(scopes);

  const payload = JSON.stringify({
    RefreshToken: refreshToken,
    Services: services,
    // gog stores only full OAuth scopes, not OIDC shorthand like 'openid'/'email'
    Scopes: scopes.filter(s => s.startsWith('https://')),
    CreatedAt: new Date().toISOString(),
  });

  const encoder = new TextEncoder();
  const jwe = await new CompactEncrypt(encoder.encode(payload))
    .setProtectedHeader({ alg: 'PBES2-HS256+A128KW', enc: 'A256GCM' })
    .encrypt(encoder.encode(password));

  return jwe;
}

/** Map Google OAuth scopes to gog service names. */
function mapScopesToServices(scopes: string[]): string[] {
  const scopeToService: Record<string, string> = {
    'gmail.modify': 'gmail',
    'gmail.settings.basic': 'gmail',
    'gmail.settings.sharing': 'gmail',
    'gmail.readonly': 'gmail',
    calendar: 'calendar',
    'calendar.readonly': 'calendar',
    drive: 'drive',
    'drive.readonly': 'drive',
    'drive.file': 'drive',
    documents: 'docs',
    'documents.readonly': 'docs',
    presentations: 'slides',
    'presentations.readonly': 'slides',
    spreadsheets: 'sheets',
    'spreadsheets.readonly': 'sheets',
    tasks: 'tasks',
    'tasks.readonly': 'tasks',
    contacts: 'contacts',
    'contacts.readonly': 'contacts',
    'contacts.other.readonly': 'contacts',
    'directory.readonly': 'contacts',
    'forms.body': 'forms',
    'forms.body.readonly': 'forms',
    'forms.responses.readonly': 'forms',
    'chat.spaces': 'chat',
    'chat.messages': 'chat',
    'chat.memberships': 'chat',
    'chat.spaces.readonly': 'chat',
    'chat.messages.readonly': 'chat',
    'chat.memberships.readonly': 'chat',
    'classroom.courses': 'classroom',
    'classroom.rosters': 'classroom',
    'script.projects': 'appscript',
    'script.deployments': 'appscript',
    keep: 'keep',
    pubsub: 'pubsub',
  };

  const prefix = 'https://www.googleapis.com/auth/';
  const services = new Set<string>();
  for (const scope of scopes) {
    const short = scope.startsWith(prefix) ? scope.slice(prefix.length) : scope;
    const service = scopeToService[short];
    if (service) services.add(service);
  }
  return [...services].sort();
}

/**
 * Write gog credential files if the corresponding env vars are set.
 * Returns true if credentials were written, false if skipped.
 *
 * Side effect: mutates the passed `env` record by setting
 * GOG_KEYRING_BACKEND, GOG_KEYRING_PASSWORD, and GOG_ACCOUNT.
 */
export async function writeGogCredentials(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
  configDir = GOG_CONFIG_DIR,
  deps?: Partial<GogCredentialsDeps>
): Promise<boolean> {
  const fs = await import('node:fs');
  const d: GogCredentialsDeps = {
    mkdirSync: deps?.mkdirSync ?? ((dir, opts) => fs.default.mkdirSync(dir, opts)),
    writeFileSync: deps?.writeFileSync ?? ((p, data, opts) => fs.default.writeFileSync(p, data, opts)),
    unlinkSync: deps?.unlinkSync ?? (p => fs.default.unlinkSync(p)),
  };

  const clientSecretRaw = env.GOOGLE_CLIENT_SECRET_JSON;
  const credentialsRaw = env.GOOGLE_CREDENTIALS_JSON;

  if (!clientSecretRaw || !credentialsRaw) {
    // Clean up stale credential files from a previous run (e.g. after disconnect)
    for (const file of [CREDENTIALS_FILE]) {
      const filePath = path.join(configDir, file);
      try {
        d.unlinkSync(filePath);
        console.log(`[gog] Removed stale ${filePath}`);
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    }
    return false;
  }

  d.mkdirSync(configDir, { recursive: true });

  // Parse client_secret.json — extract client_id + client_secret from the
  // "installed" or "web" wrapper, or use top-level fields if already flat.
  const clientConfig = JSON.parse(clientSecretRaw);
  const clientFields = clientConfig.installed ?? clientConfig.web ?? clientConfig;
  const clientId = clientFields.client_id;
  const clientSecret = clientFields.client_secret;

  // Write gogcli credentials.json (just client_id + client_secret)
  d.writeFileSync(
    path.join(configDir, CREDENTIALS_FILE),
    JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
    { mode: 0o600 }
  );

  console.log(`[gog] Wrote client credentials to ${configDir}/${CREDENTIALS_FILE}`);

  // Parse credentials to get refresh_token, email, scopes
  const credentials = JSON.parse(credentialsRaw);
  const email: string | undefined = credentials.email;
  const refreshToken: string | undefined = credentials.refresh_token;
  const scopes: string[] = credentials.scopes ?? [];

  // Write keyring entry if we have email + refresh_token
  if (email && refreshToken) {
    const keyringDir = path.join(configDir, KEYRING_DIR);
    d.mkdirSync(keyringDir, { recursive: true });

    const keyName = `token:default:${email}`;
    const fileName = percentEncode(keyName);
    const password = ''; // Empty password is supported by gog

    const jwe = await createKeyringEntry(refreshToken, scopes, password);
    d.writeFileSync(path.join(keyringDir, fileName), jwe, { mode: 0o600 });

    console.log(`[gog] Wrote keyring entry for ${email}`);

    // Set env vars for gog discovery
    env.GOG_KEYRING_BACKEND = 'file';
    env.GOG_KEYRING_PASSWORD = '';
    env.GOG_ACCOUNT = email;
  } else {
    if (!email) console.warn('[gog] No email in credentials — keyring entry skipped, gog may not work');
    if (!refreshToken) console.warn('[gog] No refresh_token in credentials — keyring entry skipped');
  }

  return true;
}
```

- [ ] **Step 2: Run tests**

Run: `cd kiloclaw/controller && npx vitest run src/gog-credentials.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add kiloclaw/controller/src/gog-credentials.ts kiloclaw/controller/src/gog-credentials.test.ts
git commit -m "feat(kiloclaw): add gog-credentials module with JWE keyring support"
```

### Task 4: Wire gog-credentials into controller and remove gws-credentials

**Files:**
- Modify: `kiloclaw/controller/src/index.ts:16-18` (import + call)
- Delete: `kiloclaw/controller/src/gws-credentials.ts`
- Delete: `kiloclaw/controller/src/gws-credentials.test.ts`

- [ ] **Step 1: Update index.ts import and call**

In `kiloclaw/controller/src/index.ts`, replace:

```typescript
import { writeGwsCredentials } from './gws-credentials';
```

with:

```typescript
import { writeGogCredentials } from './gog-credentials';
```

And replace line 118:

```typescript
  writeGwsCredentials(env as Record<string, string | undefined>);
```

with:

```typescript
  // writeGogCredentials is async (JWE encryption) but we don't await it —
  // credential writing is best-effort and should not block controller startup.
  // This is safe: the gateway process doesn't use gog credentials at startup;
  // gog is only invoked later by user/bot actions, well after this completes.
  writeGogCredentials(env as Record<string, string | undefined>).catch(err => {
    console.error('[gog] Failed to write credentials:', err);
  });
```

- [ ] **Step 2: Delete old gws files**

```bash
git rm kiloclaw/controller/src/gws-credentials.ts
git rm kiloclaw/controller/src/gws-credentials.test.ts
```

- [ ] **Step 3: Run all controller tests**

Run: `cd kiloclaw/controller && npx vitest run`
Expected: All tests pass (gog tests pass, no gws tests remain)

- [ ] **Step 4: Commit**

```bash
git add kiloclaw/controller/src/index.ts
git commit -m "refactor(kiloclaw): replace gws-credentials with gog-credentials in controller"
```

Note: The `git rm` in step 2 already staged the deletions.

---

## Chunk 2: Dockerfile changes

### Task 5: Remove gws from main Dockerfile, keep gog

**Files:**
- Modify: `kiloclaw/Dockerfile:57-58`

- [ ] **Step 1: Remove gws CLI installation**

Delete these lines from `kiloclaw/Dockerfile` (around line 57-58):

```dockerfile
# Install gws CLI (Google Workspace CLI)
RUN npm install -g @googleworkspace/cli@0.11.1
```

- [ ] **Step 2: Verify gog is still present**

Confirm line 75 still has:
```dockerfile
RUN GOBIN=/usr/local/bin go install github.com/steipete/gogcli/cmd/gog@v0.11.0 \
```

No changes needed — gog is already installed.

Note: The old `gws-credentials.ts` ran `installGwsSkills()` which installed gws agent skills via
`npx skills add https://github.com/googleworkspace/cli`. This is intentionally dropped — gog has
native OpenClaw support and doesn't need a separate skills installation step.

- [ ] **Step 3: Commit**

```bash
git add kiloclaw/Dockerfile
git commit -m "chore(kiloclaw): remove gws CLI from container image"
```

---

## Chunk 3: Google Setup rewrite

### Task 6: Update google-setup Dockerfile

**Files:**
- Modify: `kiloclaw/google-setup/Dockerfile`

- [ ] **Step 1: Remove gws and expect, keep gcloud**

Replace the full content of `kiloclaw/google-setup/Dockerfile` with:

```dockerfile
FROM node:22-slim

# Install dependencies for gcloud CLI + readline for interactive prompts
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    python3 \
    apt-transport-https \
    ca-certificates \
    gnupg \
  && rm -rf /var/lib/apt/lists/*

# Install gcloud CLI
RUN curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
    > /etc/apt/sources.list.d/google-cloud-sdk.list \
  && apt-get update && apt-get install -y --no-install-recommends google-cloud-cli \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY setup.mjs ./

ENTRYPOINT ["node", "setup.mjs"]
```

- [ ] **Step 2: Commit**

```bash
git add kiloclaw/google-setup/Dockerfile
git commit -m "chore(kiloclaw): remove gws and expect from google-setup image"
```

### Task 7: Rewrite setup.mjs

**Files:**
- Modify: `kiloclaw/google-setup/setup.mjs`

This is the largest change. The new flow:

1. Validate API key (unchanged)
2. Fetch public key (unchanged)
3. **NEW**: Sign into gcloud, create/select project, enable APIs, configure consent screen
4. **NEW**: Prompt user to create OAuth Desktop client in Console and paste client_id + client_secret
5. Run custom OAuth flow (mostly unchanged, expanded scopes)
6. **NEW**: Fetch user email via userinfo endpoint
7. Encrypt + POST (mostly unchanged, email added to credentials)

- [ ] **Step 1: Rewrite setup.mjs**

Replace the full content of `kiloclaw/google-setup/setup.mjs` with the following. Key differences from the old version are commented:

```js
#!/usr/bin/env node

/**
 * KiloClaw Google Account Setup
 *
 * Docker-based tool that:
 * 1. Validates the user's KiloCode API key against the kiloclaw worker
 * 2. Fetches the worker's RSA public key for credential encryption
 * 3. Signs into gcloud, creates/selects a GCP project, enables APIs
 * 4. Prompts user to create a Desktop OAuth client in Cloud Console
 * 5. Runs our own OAuth flow (localhost callback) to get a refresh token
 * 6. Fetches the user's email address
 * 7. Encrypts the client_secret + credentials with the worker's public key
 * 8. POSTs the encrypted bundle to the kiloclaw worker
 *
 * Usage:
 *   docker run -it --network host kilocode/google-setup --api-key=kilo_abc123
 */

import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
import http from 'node:http';
import readline from 'node:readline';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const apiKeyArg = args.find(a => a.startsWith('--api-key='));
const apiKey = apiKeyArg?.substring(apiKeyArg.indexOf('=') + 1);

const workerUrlArg = args.find(a => a.startsWith('--worker-url='));
const workerUrl = workerUrlArg
  ? workerUrlArg.substring(workerUrlArg.indexOf('=') + 1)
  : 'https://claw.kilo.ai';

if (!apiKey) {
  console.error(
    'Usage: docker run -it --network host kilocode/google-setup --api-key=<your-api-key>'
  );
  process.exit(1);
}

// Validate worker URL scheme — reject non-HTTPS except for localhost dev.
try {
  const parsed = new URL(workerUrl);
  const isLocalhost =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !isLocalhost) {
    console.error(
      `Error: --worker-url must use HTTPS (got ${parsed.protocol}). HTTP is only allowed for localhost.`
    );
    process.exit(1);
  }
  if (workerUrl !== 'https://claw.kilo.ai') {
    console.warn(`Warning: using non-default worker URL: ${workerUrl}`);
  }
} catch {
  console.error(`Error: invalid --worker-url: ${workerUrl}`);
  process.exit(1);
}

const authHeaders = {
  authorization: `Bearer ${apiKey}`,
  'content-type': 'application/json',
};

// ---------------------------------------------------------------------------
// Scopes — all gog user services + pubsub
// ---------------------------------------------------------------------------

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/gmail.settings.sharing',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/contacts.other.readonly',
  'https://www.googleapis.com/auth/directory.readonly',
  'https://www.googleapis.com/auth/forms.body',
  'https://www.googleapis.com/auth/forms.responses.readonly',
  'https://www.googleapis.com/auth/chat.spaces',
  'https://www.googleapis.com/auth/chat.messages',
  'https://www.googleapis.com/auth/chat.memberships',
  'https://www.googleapis.com/auth/classroom.courses',
  'https://www.googleapis.com/auth/classroom.rosters',
  'https://www.googleapis.com/auth/script.projects',
  'https://www.googleapis.com/auth/script.deployments',
  'https://www.googleapis.com/auth/keep',
  'https://www.googleapis.com/auth/pubsub',
];

// APIs to enable in the GCP project
const GCP_APIS = [
  'gmail.googleapis.com',
  'calendar-json.googleapis.com',
  'drive.googleapis.com',
  'docs.googleapis.com',
  'slides.googleapis.com',
  'sheets.googleapis.com',
  'tasks.googleapis.com',
  'people.googleapis.com',
  'forms.googleapis.com',
  'chat.googleapis.com',
  'classroom.googleapis.com',
  'script.googleapis.com',
  'keep.googleapis.com',
  'pubsub.googleapis.com',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function runCommand(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...opts });
    child.on('close', code => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`))));
    child.on('error', reject);
  });
}

function runCommandOutput(cmd, args) {
  return execSync([cmd, ...args].join(' '), { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

// ---------------------------------------------------------------------------
// Step 1: Validate API key
// ---------------------------------------------------------------------------

console.log('Validating API key...');

const validateRes = await fetch(`${workerUrl}/health`);
if (!validateRes.ok) {
  console.error('Cannot reach kiloclaw worker at', workerUrl);
  process.exit(1);
}

const authCheckRes = await fetch(`${workerUrl}/api/admin/google-credentials`, {
  headers: authHeaders,
});

if (authCheckRes.status === 401 || authCheckRes.status === 403) {
  console.error('Invalid API key. Check your key and try again.');
  process.exit(1);
}

console.log('API key verified.\n');

// ---------------------------------------------------------------------------
// Step 2: Fetch public key for encryption
// ---------------------------------------------------------------------------

console.log('Fetching encryption public key...');

const pubKeyRes = await fetch(`${workerUrl}/api/admin/public-key`, { headers: authHeaders });
if (!pubKeyRes.ok) {
  console.error('Failed to fetch public key from worker.');
  process.exit(1);
}

const { publicKey: publicKeyPem } = await pubKeyRes.json();

if (!publicKeyPem || !publicKeyPem.includes('BEGIN PUBLIC KEY')) {
  console.error('Invalid public key received from worker.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Step 3: Sign into gcloud and set up GCP project + APIs
// ---------------------------------------------------------------------------

console.log('Signing into Google Cloud...');
console.log('A browser window will open for you to sign in.\n');

await runCommand('gcloud', ['auth', 'login', '--brief']);

const gcloudAccount = runCommandOutput('gcloud', ['config', 'get-value', 'account']);
console.log(`\nSigned in as: ${gcloudAccount}\n`);

// Project selection: create new or use existing
console.log('Google Cloud project setup:');
console.log('  1. Create a new project (recommended)');
console.log('  2. Use an existing project\n');

const projectChoice = await ask('Choose (1 or 2): ');
let projectId;

if (projectChoice === '2') {
  // List existing projects
  console.log('\nFetching your projects...');
  try {
    await runCommand('gcloud', ['projects', 'list', '--format=table(projectId,name)']);
  } catch {
    console.warn('Could not list projects. You can still enter a project ID manually.');
  }
  projectId = await ask('\nEnter your project ID: ');
} else {
  // Generate a project ID based on date
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const defaultId = `kiloclaw-${dateStr}`;
  const inputId = await ask(`Project ID [${defaultId}]: `);
  projectId = inputId || defaultId;

  console.log(`\nCreating project "${projectId}"...`);
  try {
    await runCommand('gcloud', ['projects', 'create', projectId, '--set-as-default']);
    console.log('Project created.\n');
  } catch {
    console.error(`Failed to create project "${projectId}". It may already exist.`);
    console.error('Try a different name, or choose option 2 to use an existing project.');
    process.exit(1);
  }
}

// Set as active project
await runCommand('gcloud', ['config', 'set', 'project', projectId]);
console.log(`\nUsing project: ${projectId}`);

// Enable APIs
console.log('\nEnabling Google APIs (this may take a minute)...');
await runCommand('gcloud', ['services', 'enable', ...GCP_APIS, `--project=${projectId}`]);
console.log('APIs enabled.\n');

// Configure OAuth consent screen via REST API
console.log('Configuring OAuth consent screen...');
const accessToken = runCommandOutput('gcloud', ['auth', 'print-access-token']);

// Check if brand already exists
const brandsRes = await fetch(
  `https://iap.googleapis.com/v1/projects/${projectId}/brands`,
  { headers: { authorization: `Bearer ${accessToken}` } }
);
const brandsData = await brandsRes.json();

if (!brandsData.brands?.length) {
  const createBrandRes = await fetch(
    `https://iap.googleapis.com/v1/projects/${projectId}/brands`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        applicationTitle: 'KiloClaw',
        supportEmail: gcloudAccount,
      }),
    }
  );
  if (!createBrandRes.ok) {
    console.warn('Could not auto-configure consent screen. You may need to set it up manually.');
    console.warn(`Visit: https://console.cloud.google.com/apis/credentials/consent?project=${projectId}\n`);
  } else {
    console.log('OAuth consent screen configured.\n');
  }
} else {
  console.log('OAuth consent screen already configured.\n');
}

// ---------------------------------------------------------------------------
// Step 4: Manual OAuth client creation
// ---------------------------------------------------------------------------

const credentialsUrl = `https://console.cloud.google.com/apis/credentials?project=${projectId}`;

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  Create an OAuth client');
console.log('');
console.log(`  1. Open: ${credentialsUrl}`);
console.log('  2. Click "Create Credentials" → "OAuth client ID"');
console.log('  3. Application type: "Desktop app"');
console.log('  4. Click "Create"');
console.log('  5. Copy the Client ID and Client Secret below');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const clientId = await ask('Client ID: ');
const clientSecret = await ask('Client Secret: ');

if (!clientId || !clientSecret) {
  console.error('Client ID and Client Secret are required.');
  process.exit(1);
}

// Build client_secret.json in the standard Google format
const clientSecretObj = {
  installed: {
    client_id: clientId,
    project_id: projectId,
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_secret: clientSecret,
    redirect_uris: ['http://localhost'],
  },
};
const clientSecretJson = JSON.stringify(clientSecretObj);

// ---------------------------------------------------------------------------
// Step 5: Custom OAuth flow to get refresh token
// ---------------------------------------------------------------------------

console.log('\nStarting OAuth authorization...');

const { code, redirectUri } = await new Promise((resolve, reject) => {
  let callbackPort;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost`);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      clearTimeout(timer);
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<h1>Authorization failed</h1><p>You can close this tab.</p>');
      server.close();
      reject(new Error(`OAuth error: ${error}`));
      return;
    }

    if (code) {
      clearTimeout(timer);
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<h1>Authorization successful!</h1><p>You can close this tab.</p>');
      server.close();
      resolve({ code, redirectUri: `http://localhost:${callbackPort}` });
      return;
    }

    // Ignore non-OAuth requests (e.g. browser favicon)
    res.writeHead(404);
    res.end();
  });

  let timer;

  server.on('error', (err) => {
    clearTimeout(timer);
    reject(new Error(`OAuth callback server failed: ${err.message}`));
  });

  server.listen(0, '127.0.0.1', () => {
    callbackPort = server.address().port;
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', `http://localhost:${callbackPort}`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', SCOPES.join(' '));
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');

    console.log('\nOpen this URL in your browser to authorize:\n');
    console.log(`  ${authUrl.toString()}\n`);
    console.log(`Waiting for OAuth callback on port ${callbackPort}...`);
  });

  timer = setTimeout(() => {
    server.close();
    reject(new Error('OAuth flow timed out (5 minutes)'));
  }, 5 * 60 * 1000);
  timer.unref();
});

// Exchange authorization code for tokens
console.log('Exchanging authorization code for tokens...');

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  }),
});

if (!tokenRes.ok) {
  const err = await tokenRes.text();
  console.error('Token exchange failed:', err);
  process.exit(1);
}

const tokens = await tokenRes.json();
console.log('OAuth tokens obtained.');

// ---------------------------------------------------------------------------
// Step 6: Fetch user email
// ---------------------------------------------------------------------------

console.log('Fetching account info...');

const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
  headers: { authorization: `Bearer ${tokens.access_token}` },
});

let userEmail;
if (userinfoRes.ok) {
  const userinfo = await userinfoRes.json();
  userEmail = userinfo.email;
  console.log(`Account: ${userEmail}`);
} else {
  console.warn('Could not fetch user email. gog account auto-selection will not work.');
}

// Build credentials object — includes email for gog keyring key naming
const credentialsObj = {
  type: 'authorized_user',
  ...tokens,
  scopes: SCOPES,
  ...(userEmail && { email: userEmail }),
};
const credentialsJson = JSON.stringify(credentialsObj);

// ---------------------------------------------------------------------------
// Step 7: Encrypt credentials with worker's public key
// ---------------------------------------------------------------------------

function encryptEnvelope(plaintext, pemKey) {
  const dek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const tag = cipher.getAuthTag();
  const encryptedData = Buffer.concat([iv, encrypted, tag]);
  const encryptedDEK = crypto.publicEncrypt(
    { key: pemKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    dek
  );
  return {
    encryptedData: encryptedData.toString('base64'),
    encryptedDEK: encryptedDEK.toString('base64'),
    algorithm: 'rsa-aes-256-gcm',
    version: 1,
  };
}

console.log('Encrypting credentials...');

const encryptedBundle = {
  clientSecret: encryptEnvelope(clientSecretJson, publicKeyPem),
  credentials: encryptEnvelope(credentialsJson, publicKeyPem),
};

// ---------------------------------------------------------------------------
// Step 8: POST to worker
// ---------------------------------------------------------------------------

console.log('Sending credentials to your kiloclaw instance...');

const postRes = await fetch(`${workerUrl}/api/admin/google-credentials`, {
  method: 'POST',
  headers: authHeaders,
  body: JSON.stringify({ googleCredentials: encryptedBundle }),
});

if (!postRes.ok) {
  const body = await postRes.text();
  console.error('Failed to store credentials:', body);
  process.exit(1);
}

console.log('\nGoogle account connected!');
console.log('Credentials sent to your kiloclaw instance.');
if (userEmail) {
  console.log(`Connected account: ${userEmail}`);
}
console.log('\nYour bot can now use Gmail, Calendar, Drive, Docs, Sheets, and more.');
console.log('Redeploy your kiloclaw instance to activate.');
```

- [ ] **Step 2: Commit**

```bash
git add kiloclaw/google-setup/setup.mjs
git commit -m "feat(kiloclaw): rewrite google-setup to use gcloud + gog instead of gws"
```

### Task 8: Update google-setup README

**Files:**
- Modify: `kiloclaw/google-setup/README.md`

- [ ] **Step 1: Update README**

Replace the content of `kiloclaw/google-setup/README.md` with:

```markdown
# KiloClaw Google Setup

Docker image that guides users through connecting their Google account to KiloClaw.

## What it does

1. Validates the user's KiloCode API key
2. Signs into gcloud, creates/selects a GCP project, enables Google APIs
3. Guides user through creating a Desktop OAuth client in Google Cloud Console
4. Runs a local OAuth flow to obtain refresh tokens
5. Encrypts credentials with the worker's public key
6. POSTs the encrypted bundle to the KiloClaw worker

## Usage

```bash
docker run -it --network host ghcr.io/kilo-org/google-setup --api-key="YOUR_API_KEY"
```

For local development against a local worker:

```bash
docker run -it --network host ghcr.io/kilo-org/google-setup \
  --api-key="YOUR_API_KEY" \
  --worker-url=http://localhost:8795
```

## Publishing

The image is hosted on GitHub Container Registry at `ghcr.io/kilo-org/google-setup`.

### Prerequisites

- Docker with buildx support
- GitHub CLI (`gh`) with `write:packages` scope

### Steps

```bash
# 1. Add write:packages scope (one-time)
gh auth refresh -h github.com -s write:packages

# 2. Login to GHCR
echo $(gh auth token) | docker login ghcr.io -u $(gh api user -q .login) --password-stdin

# 3. Create multi-arch builder (one-time)
docker buildx create --use --name multiarch

# 4. Build and push (amd64 + arm64)
docker buildx build --platform linux/amd64,linux/arm64 \
  -t ghcr.io/kilo-org/google-setup:latest \
  --push \
  kiloclaw/google-setup/
```

### Tagging a release

```bash
docker buildx build --platform linux/amd64,linux/arm64 \
  -t ghcr.io/kilo-org/google-setup:latest \
  -t ghcr.io/kilo-org/google-setup:v2.0.0 \
  --push \
  kiloclaw/google-setup/
```

## Making the package public

By default, GHCR packages are private. To make it public:

1. Go to https://github.com/orgs/Kilo-Org/packages/container/google-setup/settings
2. Under "Danger Zone", click "Change visibility" and select "Public"
```

- [ ] **Step 2: Commit**

```bash
git add kiloclaw/google-setup/README.md
git commit -m "docs(kiloclaw): update google-setup README for gog migration"
```

---

## Chunk 4: Rename test/ → e2e/ and update tests

### Task 9: Rename test directory to e2e

**Files:**
- Rename: `kiloclaw/test/` → `kiloclaw/e2e/`

- [ ] **Step 1: Rename directory**

```bash
git mv kiloclaw/test kiloclaw/e2e
```

- [ ] **Step 2: Update all references to the old path**

Search for `kiloclaw/test/` in comments and docs. Update these files:

In `kiloclaw/e2e/google-credentials-integration.mjs`, update both usage lines (12-13):
```
 *   node kiloclaw/e2e/google-credentials-integration.mjs
 *   DATABASE_URL=postgres://... WORKER_URL=http://localhost:9000 node kiloclaw/e2e/google-credentials-integration.mjs
```

In `kiloclaw/e2e/google-setup-e2e.mjs`, update the usage line (19):
```
 *   node kiloclaw/e2e/google-setup-e2e.mjs
```

In `kiloclaw/e2e/docker-image-testing.md`, no path references to `kiloclaw/test/` exist, so no change needed.

- [ ] **Step 3: Commit**

```bash
git add kiloclaw/e2e kiloclaw/test
git commit -m "refactor(kiloclaw): rename test/ to e2e/"
```

### Task 10: Update E2E test — google-setup-e2e.mjs

**Files:**
- Modify: `kiloclaw/e2e/google-setup-e2e.mjs`

- [ ] **Step 1: Update gws references**

Two changes in this file:

1. Line 37 comment — change "gws CLI's random OAuth callback port" to "the OAuth callback port":

```js
// We use --network host so the OAuth callback port is reachable
// from the browser. This also means localhost in the container reaches the host,
// so we don't need host.docker.internal.
```

2. The usage path on line 19 was already updated in Task 9 step 2.

The test is otherwise unchanged — it builds the docker image, runs it interactively, and checks `googleConnected=true`. The setup.mjs rewrite handles the gog migration; the E2E test just validates the outcome.

- [ ] **Step 2: Commit**

```bash
git add kiloclaw/e2e/google-setup-e2e.mjs
git commit -m "chore(kiloclaw): update e2e test comments for gog migration"
```

### Task 11: Update E2E test — google-credentials-integration.mjs

**Files:**
- Modify: `kiloclaw/e2e/google-credentials-integration.mjs`

- [ ] **Step 1: Update usage comment path**

Line 13 — already updated in Task 9. Verify it reads:
```
 *   node kiloclaw/e2e/google-credentials-integration.mjs
```

This test is API-level (POST/GET/DELETE google-credentials endpoints) and doesn't reference gws or gog directly. No other changes needed.

- [ ] **Step 2: Run the integration test to verify it still works**

Run: `node kiloclaw/e2e/google-credentials-integration.mjs`
Expected: All tests pass (requires local Postgres + worker running)

Note: If local services aren't running, this step can be skipped — the test doesn't touch gws/gog code paths.

---

## Chunk 5: Final validation and cleanup

### Task 12: Run all tests

- [ ] **Step 1: Run controller unit tests**

Run: `cd kiloclaw/controller && npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run worker tests**

Run: `cd kiloclaw && pnpm test`
Expected: All tests pass

- [ ] **Step 3: Run format on changed files**

Run: `pnpm run format:changed` (from repo root)

- [ ] **Step 4: Run typecheck**

Run: `pnpm run typecheck` (from repo root)
Expected: No type errors

- [ ] **Step 5: Run linter**

Run: `pnpm run lint` (from repo root)
Expected: No lint errors

- [ ] **Step 6: Commit any formatting fixes**

```bash
git add -A
git commit -m "style(kiloclaw): format changes from gog migration"
```

### Task 13: Verify no stale gws references remain

- [ ] **Step 1: Search for leftover gws references**

Run: `grep -r "gws" kiloclaw/ --include="*.ts" --include="*.mjs" --include="*.json" --include="*.md" --include="Dockerfile" -l`

Expected: No results. If any files still reference gws, update them.

Note: `gws` may appear in Git history or in paths like `gateway` — only actual gws CLI references need removal.

- [ ] **Step 2: Search for leftover GOOGLE_WORKSPACE_CLI references**

Run: `grep -r "GOOGLE_WORKSPACE_CLI" kiloclaw/ -l`

Expected: No results.

- [ ] **Step 3: Verify gws npm package is not referenced**

Run: `grep -r "@googleworkspace/cli" kiloclaw/ -l`

Expected: No results.

- [ ] **Step 4: Commit any remaining fixes**

If any stale references were found and fixed:
```bash
git add -A
git commit -m "chore(kiloclaw): remove remaining gws references"
```
