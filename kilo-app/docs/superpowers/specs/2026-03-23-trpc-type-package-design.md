# Extract tRPC Router Type into Shared Package

## Problem

`kilo-app` (Expo/React Native) and future consumers need access to the `RootRouter` type to create typed tRPC clients. The type currently lives in `src/routers/root-router.ts` inside the Next.js app and cannot be imported from other workspace packages due to `@/` path alias conflicts.

## Approach

Create a thin `@kilocode/trpc` package in `packages/trpc/` (same pnpm workspace as `kilo-app` and all other packages) that re-exports the `RootRouter` type. A declaration build step resolves the `@/` path aliases during emit, producing standalone `.d.ts` files that consumers can import without path conflicts.

No router implementations move. No functionality changes.

## Technical Constraint

The `RootRouter` type is inferred from 28+ composed routers, each importing from `@/lib/*` and `@/routers/*`. These `@/` aliases resolve via the main app's tsconfig (`@/` -> `./src/*` relative to the repo root). When another package's TypeScript compiler encounters these transitive imports, it uses its own tsconfig where `@/` maps to a different directory. This makes direct source re-exports impossible without a build step.

### `server-only` Import

`root-router.ts` has `import 'server-only'` at line 1. During `tsc --emitDeclarationOnly`, TypeScript resolves but does not execute this module. The `server-only` package must be resolvable from the trpc package's node_modules — listing it as a dev dependency ensures this. It contributes no types to the `RootRouter` surface.

### Transitive Type Dependencies

The `RootRouter` type surface includes input/output types from all routers. During declaration emit, `tsc` must resolve types from packages used in procedure signatures: `zod` (input schemas), `drizzle-orm` (query result types), `@kilocode/db` (schema types), and `@trpc/server`. These must be resolvable from the trpc package — either via pnpm hoisting or explicit dev dependencies. The package lists the known ones; others surface as build errors during implementation.

## Design

### Package Structure

```
packages/trpc/
  package.json
  tsconfig.json
  src/
    index.ts
  dist/               (generated, gitignored)
    index.d.ts
    index.d.ts.map
```

### `src/index.ts`

```ts
export type { RootRouter } from '../../src/routers/root-router';
export type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
```

Three exports: the root router type and two tRPC utility types for deriving input/output types from any procedure.

### `tsconfig.json`

A minimal config — does NOT extend the root Next.js tsconfig to avoid inheriting Next.js-specific settings (JSX, module resolution, plugins). Only defines the settings needed for declaration emit and the `@/` path mapping.

```json
{
  "compilerOptions": {
    "target": "es2017",
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "emitDeclarationOnly": true,
    "outDir": "dist",
    "isolatedModules": true,
    "esModuleInterop": true,
    "paths": {
      "@/*": ["../../src/*"],
      "@kilocode/db": ["../db/src/index.ts"],
      "@kilocode/db/*": ["../db/src/*"],
      "@kilocode/encryption": ["../encryption/src/index.ts"]
    }
  },
  "include": ["src/**/*"]
}
```

The `module` and `moduleResolution` settings match the root tsconfig to ensure identical resolution behavior for the same source files.

The `paths` entries mirror the root tsconfig's mappings so that all `@/` and `@kilocode/*` imports in the router files resolve correctly during declaration emit.

### `package.json`

```json
{
  "name": "@kilocode/trpc",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsgo --noEmit --incremental false"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts"
    }
  },
  "dependencies": {
    "@trpc/server": "^11.13.0"
  },
  "devDependencies": {
    "@kilocode/db": "workspace:*",
    "@sentry/nextjs": "^10.43.0",
    "@typescript/native-preview": "catalog:",
    "drizzle-orm": "catalog:",
    "server-only": "^0.0.1",
    "typescript": "catalog:",
    "zod": "catalog:"
  }
}
```

This is a types-only package — the `exports` field uses the standard `types` condition. No runtime entry point. Dev dependencies include packages whose types are transitively needed during declaration emit (`@sentry/nextjs` from `init.ts`, `drizzle-orm` from query result types, `zod` from input schemas, `server-only` from side-effect imports in `root-router.ts` and `init.ts`). Additional transitive deps may surface as build errors during implementation.

### Build Step

`pnpm run build` inside `packages/trpc/` runs `tsc -p tsconfig.json`, which:

1. Resolves `src/index.ts` and its transitive type dependencies
2. Uses the `@/` path mapping to correctly resolve all router files in `../../src/`
3. Emits `dist/index.d.ts` with the fully-resolved `RootRouter` type

This must run after any router changes and before consumers typecheck.

## Changes to Existing Code

### Next.js app (`src/`)

None. `root-router.ts`, `init.ts`, all routers, and all client code remain unchanged.

### `pnpm-workspace.yaml`

Add `packages/trpc` (it is not yet listed, though `packages/db` etc. are listed individually):

```yaml
packages:
  - packages/trpc
```

### Root `package.json`

Update the `typecheck` script to build the trpc package declarations before typechecking consumers:

```
"typecheck": "pnpm --filter @kilocode/trpc run build && tsgo --noEmit --incremental false && pnpm -r --filter '!kilocode-backend' run typecheck"
```

### `kilo-app/package.json`

Add dependency:

```json
"dependencies": {
  "@kilocode/trpc": "workspace:*"
}
```

### `.gitignore`

Add `packages/trpc/dist/` to gitignore.

## Consumer Usage

```ts
// kilo-app or any other package
import type { RootRouter } from '@kilocode/trpc';
import type { inferRouterInputs, inferRouterOutputs } from '@kilocode/trpc';
import { createTRPCClient, httpBatchLink } from '@trpc/client';

type AppInput = inferRouterInputs<RootRouter>;
type AppOutput = inferRouterOutputs<RootRouter>;

const client = createTRPCClient<RootRouter>({
  links: [httpBatchLink({ url: 'https://api.example.com/trpc' })],
});
```

## What This Does NOT Include

- Moving router implementations out of `src/`
- Creating shared tRPC client utilities (each consumer creates its own client)
- Changes to the existing Next.js tRPC client or provider setup
- Any runtime behavior changes
