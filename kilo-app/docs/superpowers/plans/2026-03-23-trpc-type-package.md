# @kilocode/trpc Type Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a `@kilocode/trpc` workspace package that exports the `RootRouter` type so `kilo-app` and other consumers can create typed tRPC clients.

**Architecture:** Thin types-only package at `packages/trpc/` with a `tsc` declaration build step. The package's `tsconfig.json` maps `@/` to the main app's `src/`, allowing `tsc` to resolve the full router type graph and emit standalone `.d.ts` files. No router code moves; no functionality changes.

**Tech Stack:** TypeScript (`tsc` for declaration emit, `tsgo` for typechecking), pnpm workspaces, `@trpc/server`

**Spec:** `kilo-app/docs/superpowers/specs/2026-03-23-trpc-type-package-design.md`

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `packages/trpc/package.json` | Package manifest with types-only exports |
| Create | `packages/trpc/tsconfig.json` | Declaration emit config with `@/` path mapping |
| Create | `packages/trpc/src/index.ts` | Re-exports `RootRouter` + helper types |
| Modify | `pnpm-workspace.yaml` | Register `packages/trpc` in workspace |
| Modify | `.gitignore` | Ignore `packages/trpc/dist/` |
| Modify | `package.json` (root) | Update `typecheck` script ordering |
| Modify | `kilo-app/package.json` | Add `@kilocode/trpc` dependency |

---

### Task 1: Create the package skeleton

**Files:**
- Create: `packages/trpc/package.json`
- Create: `packages/trpc/tsconfig.json`
- Create: `packages/trpc/src/index.ts`

- [ ] **Step 1: Create `packages/trpc/src/index.ts`**

```ts
export type { RootRouter } from '../../src/routers/root-router';
export type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
```

- [ ] **Step 2: Create `packages/trpc/tsconfig.json`**

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

- [ ] **Step 3: Create `packages/trpc/package.json`**

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

- [ ] **Step 4: Commit**

```bash
git add packages/trpc/
git commit -m "feat: create @kilocode/trpc package skeleton"
```

---

### Task 2: Register package in workspace and gitignore

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `.gitignore`

- [ ] **Step 1: Add `packages/trpc` to `pnpm-workspace.yaml`**

Add after the existing `packages/eslint-config` entry (keeping it grouped with other `packages/*` entries):

```yaml
  - packages/trpc
```

- [ ] **Step 2: Add dist/ to `.gitignore`**

Add at the end of the file:

```
# @kilocode/trpc declaration output
packages/trpc/dist/
```

- [ ] **Step 3: Install dependencies**

Run: `pnpm install`

Expected: Lockfile updates, `@kilocode/trpc` linked in workspace. Verify with `pnpm ls --filter @kilocode/trpc --depth 0`.

- [ ] **Step 4: Commit**

```bash
git add pnpm-workspace.yaml .gitignore pnpm-lock.yaml
git commit -m "chore: register @kilocode/trpc in workspace and gitignore dist"
```

---

### Task 3: Build declarations and fix transitive dependency errors

**Files:**
- Modify: `packages/trpc/package.json` (if missing deps discovered)

- [ ] **Step 1: Run the declaration build**

Run: `cd packages/trpc && pnpm run build`

Expected: Either succeeds (emitting `dist/index.d.ts` and `dist/index.d.ts.map`) or fails with missing module errors.

- [ ] **Step 2: If build fails — add missing transitive dependencies**

For each "Cannot find module 'X'" error, add the package to `devDependencies` in `packages/trpc/package.json`. Use `catalog:` for versions already in the workspace catalog, `workspace:*` for workspace packages, or `*` for others. Then run `pnpm install` and re-run `pnpm run build`. Repeat until the build succeeds.

- [ ] **Step 3: Verify the output**

Run: `ls -la packages/trpc/dist/`

Expected: `index.d.ts` and `index.d.ts.map` exist.

Run: `head -20 packages/trpc/dist/index.d.ts`

Expected: Contains `export type { RootRouter }` and tRPC-related type definitions.

- [ ] **Step 4: Commit**

```bash
git add packages/trpc/
git commit -m "feat: successful declaration emit for @kilocode/trpc"
```

---

### Task 4: Wire up root typecheck script

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Update the root `typecheck` script**

In the root `package.json`, change:

```
"typecheck": "tsgo --noEmit --incremental false && pnpm -r --filter '!kilocode-backend' run typecheck",
```

To:

```
"typecheck": "pnpm --filter @kilocode/trpc run build && tsgo --noEmit --incremental false && pnpm -r --filter '!kilocode-backend' run typecheck",
```

This ensures `dist/index.d.ts` is generated before any consumer package typechecks.

- [ ] **Step 2: Verify the full typecheck passes**

Run: `pnpm run typecheck`

Expected: All packages typecheck successfully, including the new `@kilocode/trpc` build step running first.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: build @kilocode/trpc declarations before typecheck"
```

---

### Task 5: Add dependency in kilo-app and verify type import

**Files:**
- Modify: `kilo-app/package.json`

- [ ] **Step 1: Add `@kilocode/trpc` to kilo-app dependencies**

In `kilo-app/package.json`, add to `dependencies`:

```json
"@kilocode/trpc": "workspace:*"
```

- [ ] **Step 2: Install**

Run: `pnpm install`

- [ ] **Step 3: Verify the type resolves from kilo-app**

Run a one-off typecheck to confirm the import works:

```bash
cd kilo-app && pnpm exec tsgo --noEmit --incremental false
```

Expected: No errors related to `@kilocode/trpc`. (kilo-app doesn't import it yet, but the package should be resolvable.)

- [ ] **Step 4: Commit**

```bash
git add kilo-app/package.json pnpm-lock.yaml
git commit -m "chore(kilo-app): add @kilocode/trpc dependency"
```

---

### Task 6: Final validation

- [ ] **Step 1: Run full typecheck from root**

Run: `pnpm run typecheck`

Expected: All passes — `@kilocode/trpc` build, root tsgo, and all sub-package typechecks.

- [ ] **Step 2: Run format on changed files**

Run: `pnpm run format:changed`

- [ ] **Step 3: Commit any formatting changes**

```bash
git add -A
git commit -m "style: format changed files"
```
