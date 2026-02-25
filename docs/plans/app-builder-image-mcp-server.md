# App Builder Image MCP Server - Implementation Plan

**Status:** Draft
**Created:** 2026-02-03
**Last updated:** 2026-02-24
**Author:** AI-assisted planning session

## Summary

Enable AI to embed user-uploaded images on generated websites and visually analyze them by providing a standalone MCP server with two tools: `transfer_image` (moves images from temporary to permanent public R2 storage) and `get_image` (returns image content for AI vision analysis).

## Problem Statement

Currently, users can upload images to App Builder, but there's no way for the AI to:

1. Embed these images directly into the generated website code (images are in a private R2 bucket with no public URLs)
2. Visually analyze uploaded images (cloud-agent-next/v2 CLI has no `--attach` mechanism)

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SESSION INITIALIZATION                          │
│                                                                         │
│  Backend generates scoped JWT token containing:                         │
│  - src_bucket / src_prefix (read from temp bucket)                     │
│  - dst_bucket / dst_prefix (write to public bucket)                    │
│  - exp: 24 hours                                                        │
│                                                                         │
│  MCP server config added to prepareSession with token in headers       │
│  (persists in Durable Object for the session lifetime)                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              RUNTIME FLOW                               │
│                                                                         │
│  1. User uploads images → cloud-agent-attachments bucket (temp)        │
│  2. Image paths appended to user message prompt (per-message)          │
│  3. AI decides to analyze → calls get_image MCP tool → gets base64    │
│  4. AI decides to embed → calls transfer_image MCP tool                │
│  5. MCP server validates JWT, copies file to public bucket             │
│  6. Returns public URL → AI embeds in generated HTML/CSS               │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐         ┌──────────────────────┐
│  cloud-agent-        │  copy   │  app-builder-assets  │
│  attachments (temp)  │ ──────▶ │  (public)            │
│                      │         │                      │
│  {userId}/app-builder│         │  user_{id}/{appId}/  │
│  /{msgUuid}/{file}   │         │  {filename}          │
└──────────────────────┘         └──────────────────────┘
         │                                  │
         │ read (S3 API)                    │ write (S3 API) + public URL
         ▼                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              MCP Server (cloudflare-images-mcp)                    │
│                                                                         │
│  Tool: transfer_image                                                   │
│  Input: { sourcePath: string }                                         │
│  Output: { publicUrl: string }                                         │
│                                                                         │
│  Tool: get_image                                                        │
│  Input: { sourcePath: string }                                         │
│  Output: MCP image content (base64)                                    │
│                                                                         │
│  Auth: JWT token in Authorization header, validated per-request        │
│  Storage: S3-compatible API (aws4fetch), no native R2 bindings         │
│  Bucket→URL mapping in worker env vars                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

## Design Decisions

| Decision               | Choice                        | Rationale                                                                                      |
| ---------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------- |
| Hosting                | Separate Cloudflare Worker    | Reusable across cloud-agent-next and cloud-agent UI; independently deployable                  |
| Target worker          | cloud-agent-next (v2) only    | v2 CLI has no `--attach`; v1 support can be added later                                        |
| Image context delivery | User message prompt           | Appended per-message, no stale system prompt; no `updateSession` needed                        |
| Image accumulation     | Current message only          | AI has conversation history for prior images; simpler, no state tracking                       |
| Vision analysis        | `get_image` MCP tool          | v2 CLI has no `--attach`; MCP tool returns base64 image content                                |
| Token format           | Signed JWT (24h)              | Stateless verification; set once at `prepareSession`, persists in DO                           |
| Token scope            | Bucket + prefix per JWT       | Supports different source/destination buckets for future use cases                             |
| MCP transport          | `type: "remote"`              | Matches cloud-agent-next schema (no explicit `sse` type; `remote` covers URL-based transports) |
| R2 access              | S3-compatible API (aws4fetch) | Buckets specified in JWT, not compile-time R2 bindings; enables dynamic bucket selection       |
| Bucket→URL mapping     | Worker env vars               | Worker maps `dst_bucket` → public base URL; avoids putting URLs in JWT                         |
| MIME type validation   | Worker validates Content-Type | Rejects non-image files on read; source validation at upload time is not sufficient            |
| Config format          | `wrangler.jsonc`              | Matches all other `cloudflare-*` workers in the repo                                           |
| Duplicate transfers    | Overwrite                     | Simpler than generating unique names or hash-based dedup                                       |
| Project deletion       | Delete public assets          | Clean up storage when project is removed                                                       |
| Storage quotas         | Deferred                      | Monitor usage first before implementing limits                                                 |

## Deliverables

| #   | Component           | Description                                                                      |
| --- | ------------------- | -------------------------------------------------------------------------------- |
| 1   | R2 Bucket           | Create `app-builder-assets` with public read access                              |
| 2   | MCP Server Worker   | New `cloudflare-images-mcp/` with `transfer_image` and `get_image` tools         |
| 3   | JWT Service         | Token generation in `src/lib/app-builder/image-mcp-token.ts`                     |
| 4   | Session Integration | Add `mcpServers` to `createProject` and `createV2Session` `prepareSession` calls |
| 5   | Image Context       | Append image paths to user `prompt` in `createProject` and `sendMessage`         |
| 6   | Cleanup             | Delete public assets when project is deleted                                     |

---

## Task 1: R2 Bucket Setup

**Actions:**

- Create R2 bucket `app-builder-assets` in Cloudflare dashboard
- Enable public access on the bucket
- Configure custom domain (optional): e.g., `assets.up.kilo.ai`
- Create R2 API credentials with access to both `cloud-agent-attachments` (read) and `app-builder-assets` (write)
- Add environment variables / secrets to MCP worker:
  - `R2_ACCESS_KEY_ID` (secret)
  - `R2_SECRET_ACCESS_KEY` (secret)
  - `R2_ENDPOINT` (S3-compatible endpoint)
  - `BUCKET_PUBLIC_URLS` (env var, JSON mapping bucket names to public base URLs)

---

## Task 2: MCP Server Worker

**New project:** `cloudflare-images-mcp/`

### Project Structure

```
cloudflare-images-mcp/
├── src/
│   ├── index.ts              # Worker entry, MCP protocol handling
│   ├── tools/
│   │   ├── transfer-image.ts # transfer_image tool
│   │   └── get-image.ts      # get_image tool
│   ├── auth/
│   │   └── jwt.ts            # JWT validation
│   └── r2/
│       └── client.ts         # R2 S3-compatible operations (aws4fetch)
├── wrangler.jsonc
├── package.json
└── tsconfig.json
```

### MCP Tool Definitions

```typescript
// transfer_image — copy to public storage
{
  name: "transfer_image",
  description: "Transfer an uploaded image to permanent public storage. Returns a public URL for use in <img> tags or CSS.",
  inputSchema: {
    type: "object",
    properties: {
      sourcePath: {
        type: "string",
        description: "The path of the uploaded image (from the Available Images list in the user message)"
      }
    },
    required: ["sourcePath"]
  }
}

// get_image — return image content for visual analysis
{
  name: "get_image",
  description: "Retrieve an uploaded image for visual analysis. Returns the image content so you can see what the image looks like.",
  inputSchema: {
    type: "object",
    properties: {
      sourcePath: {
        type: "string",
        description: "The path of the uploaded image (from the Available Images list in the user message)"
      }
    },
    required: ["sourcePath"]
  }
}
```

### JWT Claims Schema

```typescript
type ImageMCPTokenClaims = {
  // Source access (read from temp bucket)
  src_bucket: string; // e.g. "cloud-agent-attachments"
  src_prefix: string; // e.g. "{userId}/app-builder/"

  // Destination access (write to public bucket)
  dst_bucket: string; // e.g. "app-builder-assets"
  dst_prefix: string; // e.g. "user_{userId}/{projectId}/"

  // Context (for audit logging)
  project_id: string;
  user_id: string;

  // Standard JWT claims
  exp: number; // 24 hours from issue
  iat: number;
};
```

### Worker Configuration

```jsonc
// wrangler.jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "images-mcp",
  "main": "src/index.ts",
  "compatibility_date": "2025-01-01",
  // No R2 bindings — uses S3 API via aws4fetch for dynamic bucket access
  "vars": {
    "BUCKET_PUBLIC_URLS": "{\"app-builder-assets\": \"https://assets.up.kilo.ai\"}",
  },
  // Secrets (not in config):
  //   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, JWT_PUBLIC_KEY
}
```

### Transfer Logic

```typescript
async function transferImage(sourcePath: string, claims: ImageMCPTokenClaims): Promise<string> {
  // 1. Validate sourcePath starts with allowed prefix
  const fullSourceKey = `${claims.src_prefix}${sourcePath}`;
  if (!fullSourceKey.startsWith(claims.src_prefix)) {
    throw new Error('Access denied: path outside allowed prefix');
  }

  // 2. Read from source bucket (S3 API via aws4fetch)
  const sourceObject = await r2Client.getObject(claims.src_bucket, fullSourceKey);
  if (!sourceObject) {
    throw new Error(`Image not found: ${sourcePath}`);
  }

  // 3. Validate MIME type
  const contentType = sourceObject.contentType;
  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  if (!contentType || !allowedTypes.includes(contentType)) {
    throw new Error(`Invalid file type: ${contentType}. Only images are allowed.`);
  }

  // 4. Extract filename and write to destination bucket
  const filename = sourcePath.split('/').pop();
  const destKey = `${claims.dst_prefix}${filename}`;
  await r2Client.putObject(claims.dst_bucket, destKey, sourceObject.body, {
    contentType,
  });

  // 5. Look up public base URL for destination bucket
  const bucketUrls = JSON.parse(BUCKET_PUBLIC_URLS);
  const baseUrl = bucketUrls[claims.dst_bucket];
  if (!baseUrl) {
    throw new Error(`No public URL configured for bucket: ${claims.dst_bucket}`);
  }

  return `${baseUrl}/${destKey}`;
}
```

### Get Image Logic

```typescript
async function getImage(sourcePath: string, claims: ImageMCPTokenClaims): Promise<MCPImageContent> {
  // 1. Validate sourcePath
  const fullSourceKey = `${claims.src_prefix}${sourcePath}`;
  if (!fullSourceKey.startsWith(claims.src_prefix)) {
    throw new Error('Access denied: path outside allowed prefix');
  }

  // 2. Read from source bucket
  const sourceObject = await r2Client.getObject(claims.src_bucket, fullSourceKey);
  if (!sourceObject) {
    throw new Error(`Image not found: ${sourcePath}`);
  }

  // 3. Validate MIME type
  const contentType = sourceObject.contentType;
  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  if (!contentType || !allowedTypes.includes(contentType)) {
    throw new Error(`Invalid file type: ${contentType}. Only images are allowed.`);
  }

  // 4. Convert to base64 and return as MCP image content
  const arrayBuffer = await sourceObject.body.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

  return {
    type: 'image',
    data: base64,
    mimeType: contentType,
  };
}
```

---

## Task 3: JWT Token Service

**New file:** `src/lib/app-builder/image-mcp-token.ts`

```typescript
import * as jose from 'jose';

type GenerateImageMCPTokenParams = {
  userId: string;
  projectId: string;
  owner: { type: 'user' | 'org'; id: string };
  srcBucket?: string;
  dstBucket?: string;
};

async function generateImageMCPToken(params: GenerateImageMCPTokenParams): Promise<string> {
  const { userId, projectId, owner } = params;
  const srcBucket = params.srcBucket ?? 'cloud-agent-attachments';
  const dstBucket = params.dstBucket ?? 'app-builder-assets';

  const ownerPrefix = owner.type === 'user' ? `user_${owner.id}` : `org_${owner.id}`;

  const claims = {
    src_bucket: srcBucket,
    src_prefix: `${userId}/app-builder/`,
    dst_bucket: dstBucket,
    dst_prefix: `${ownerPrefix}/${projectId}/`,
    project_id: projectId,
    user_id: userId,
  };

  const privateKey = await jose.importPKCS8(process.env.IMAGE_MCP_PRIVATE_KEY ?? '', 'RS256');

  return new jose.SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(privateKey);
}
```

**Key management:**

- Generate RSA key pair for image MCP tokens
- Store private key in backend secrets: `IMAGE_MCP_PRIVATE_KEY`
- Store public key in MCP worker secrets: `JWT_PUBLIC_KEY`

---

## Task 4: Session Integration

### Integration Points (v2 only)

MCP config is set at `prepareSession` time and persists in the Durable Object. The two places where v2 sessions are created:

1. **`createProject`** (initial project creation)
2. **`createV2Session`** (session upgrade or GitHub migration)

#### In `createProject`:

```typescript
// Generate MCP token
const mcpToken = await generateImageMCPToken({
  userId: createdByUserId,
  projectId,
  owner,
});

// Add to prepareSession params (v2 path)
const sharedParams = {
  // ... existing params ...
  mcpServers: {
    'app-builder-images': {
      type: 'remote' as const,
      url: process.env.CLOUD_AGENT_IMAGES_MCP_URL, // e.g. "https://images-mcp.kilo.workers.dev/mcp"
      headers: {
        Authorization: `Bearer ${mcpToken}`,
      },
    },
  },
};
```

#### In `createV2Session`:

```typescript
// Generate MCP token for the new session
const mcpToken = await generateImageMCPToken({
  userId: createdByUserId,
  projectId,
  owner,
});

const prepareParams = {
  // ... existing params ...
  mcpServers: {
    'app-builder-images': {
      type: 'remote' as const,
      url: process.env.CLOUD_AGENT_IMAGES_MCP_URL,
      headers: {
        Authorization: `Bearer ${mcpToken}`,
      },
    },
  },
};
```

**Note:** `sendMessageV2` / `sendMessage` do NOT need changes for MCP config — it persists from `prepareSession`. The 24h JWT covers the typical session lifetime.

---

## Task 5: Image Context in User Messages

Image paths are appended to the user's `prompt` when images are present. Only images from the current message are included (no accumulation across messages).

**Helper function:**

```typescript
// src/lib/app-builder/image-context.ts

type ImageInfo = {
  filename: string;
  path: string; // e.g. "app-builder/msg-abc123/logo.png"
};

function buildImageContext(images: ImageInfo[]): string {
  if (images.length === 0) return '';

  const imageList = images.map(img => `- ${img.filename} (sourcePath: "${img.path}")`).join('\n');

  return `\n\n---\nAvailable Images:\nThe following images have been uploaded. To see what an image looks like, call the get_image tool. To use an image on the website, call the transfer_image tool to get a permanent public URL.\n${imageList}`;
}
```

**Usage in `createProject` and `sendMessage`:**

```typescript
// Build image context from uploaded images
const imageContext = images
  ? buildImageContext(
      images.files.map(filename => ({
        filename,
        path: `${images.path}/${filename}`,
      }))
    )
  : '';

// Append to user prompt
const augmentedPrompt = prompt + imageContext;

// Pass augmentedPrompt instead of raw prompt
```

**No changes to `--attach` flow** — cloud-agent-next (v2) does not use `--attach`. Images are accessed exclusively through MCP tools.

---

## Task 6: Project Cleanup

**File:** `src/lib/app-builder/app-builder-service.ts`

**In `deleteProject()`:**

```typescript
async function deleteProject(projectId: string, owner: Owner): Promise<void> {
  await getProjectWithOwnershipCheck(projectId, owner);

  // Delete public assets for this project
  await deletePublicAssets(projectId, owner);

  // Existing cleanup
  await appBuilderClient.deleteProject(projectId);
  await db.delete(app_builder_projects).where(eq(app_builder_projects.id, projectId));
}
```

**New file:** `src/lib/r2/app-builder-assets.ts`

Uses S3-compatible API (same as MCP worker) to list and delete objects by prefix.

```typescript
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

async function deletePublicAssets(
  projectId: string,
  owner: { type: 'user' | 'org'; id: string }
): Promise<void> {
  const prefix =
    owner.type === 'user' ? `user_${owner.id}/${projectId}/` : `org_${owner.id}/${projectId}/`;

  const listResult = await r2Client.send(
    new ListObjectsV2Command({
      Bucket: 'app-builder-assets',
      Prefix: prefix,
    })
  );

  if (!listResult.Contents || listResult.Contents.length === 0) return;

  await r2Client.send(
    new DeleteObjectsCommand({
      Bucket: 'app-builder-assets',
      Delete: {
        Objects: listResult.Contents.map(obj => ({ Key: obj.Key })),
      },
    })
  );
}
```

---

## Estimated Effort

| Phase                  | Tasks                                          | Estimate        |
| ---------------------- | ---------------------------------------------- | --------------- |
| 1. Infrastructure      | R2 bucket, API credentials, JWT keys, env vars | 1-2 hours       |
| 2. MCP Server Worker   | New `cloudflare-images-mcp/` with both tools   | 4-6 hours       |
| 3. JWT Service         | Token generation + key management              | 1-2 hours       |
| 4. Backend Integration | Session config + image context in prompts      | 2-3 hours       |
| 5. Cleanup             | Delete assets on project deletion              | 1 hour          |
| 6. Testing             | Integration + E2E tests                        | 2-3 hours       |
| **Total**              |                                                | **11-17 hours** |

---

## Security Considerations

1. **JWT Validation:** MCP server validates JWT signature and expiration on every tool call
2. **Path Traversal:** Validate that sourcePath doesn't escape the allowed prefix (e.g., using `../`)
3. **MIME Type Validation:** Worker reads Content-Type from source object, rejects non-image types
4. **Token Scope:** JWT restricts read to `src_bucket`/`src_prefix`, write to `dst_bucket`/`dst_prefix`
5. **No Native R2 Bindings:** Worker uses S3 API with credentials — buckets are dynamically determined from JWT, not compile-time
6. **Rate Limiting:** Consider adding rate limits to prevent abuse (defer to Phase 2)
7. **No User Code Access:** MCP server runs externally, not in sandbox — user code cannot access it directly

## Future Enhancements

1. **`list_images` tool:** If needed, add tool to list available images in source bucket
2. **Storage quotas:** Per-project limits on public storage
3. **Image optimization:** Resize/compress images on transfer
4. **CDN integration:** Add Cloudflare CDN in front of public bucket
5. **v1 (cloud-agent) support:** Wire up MCP config for v1 session paths
6. **Cloud-agent UI integration:** Share the same MCP server from the cloud-agent web UI

---

## Open Questions (Resolved)

| Question                      | Resolution                                                |
| ----------------------------- | --------------------------------------------------------- |
| Separate service or embedded? | Separate worker — reusable across cloud-agent-next and UI |
| Token expiration?             | 24 hours, set once at `prepareSession`                    |
| Token refresh per message?    | Not needed — MCP config persists in DO                    |
| Image context location?       | User message prompt (not system prompt)                   |
| Image accumulation?           | Current message only — AI has conversation history        |
| Vision analysis?              | `get_image` MCP tool returns base64 content               |
| `--attach` behavior?          | No `--attach` in v2 — images accessed exclusively via MCP |
| MCP transport type?           | `type: "remote"` (matches cloud-agent-next schema)        |
| Config format?                | `wrangler.jsonc` (matches repo convention)                |
| R2 access method?             | S3-compatible API (aws4fetch), not native R2 bindings     |
| MIME type validation?         | Worker validates Content-Type on read                     |
| Bucket flexibility?           | JWT claims include src/dst bucket names for future reuse  |
| Duplicate handling?           | Overwrite existing                                        |
| Cleanup on delete?            | Yes, delete public assets                                 |
| Storage quotas?               | Defer, monitor usage first                                |
| Worker version scope?         | v2 only (cloud-agent-next); v1 support deferred           |
