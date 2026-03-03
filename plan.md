# Fix: Eliminate redundant `unifiedSessions.list` query invocations

## Problem

`useSidebarSessions` — which calls `useQuery` for `unifiedSessions.list` — is called inside
`CloudChatContainer`. That component re-renders ~6 times during its session-loading lifecycle due
to cascading `useState` / `useAtomValue` updates, and React Strict Mode doubles that to ~12.

Each re-render within a single React tick adds another entry to tRPC's batching layer, which
collects all `useQuery` calls in a tick and sends them as one HTTP request. React Query
deduplicates *concurrent* requests with the same key, but here it sees a single in-flight batched
request containing 12 sub-operations — so deduplication does not fire.

The fix is to **lift `useSidebarSessions` one level up into `CloudChatPage`**, which is a
stateless pass-through component that never re-renders on its own. The `sessions` list and
`refetchSessions` callback are then passed down as props.

The fix applies identically to both `cloud-agent` (v1) and `cloud-agent-next` (v2).

---

## Files to change

### 1. `src/components/cloud-agent/CloudChatPage.tsx`

**Before** — thin wrapper, no logic:
```tsx
export default function CloudChatPage(props: CloudChatPageProps) {
  return <CloudChatContainer {...props} />;
}
```

**After** — call `useSidebarSessions` here, pass results as props:
```tsx
import { useSidebarSessions } from './hooks/useSidebarSessions';

export default function CloudChatPage({ organizationId }: CloudChatPageProps) {
  const { sessions, refetchSessions } = useSidebarSessions({
    organizationId: organizationId ?? null,
  });
  return (
    <CloudChatContainer
      organizationId={organizationId}
      sessions={sessions}
      refetchSessions={refetchSessions}
    />
  );
}
```

### 2. `src/components/cloud-agent-next/CloudChatPage.tsx`

Identical change to the above (different import paths, otherwise the same).

---

### 3. `src/components/cloud-agent/CloudChatContainer.tsx`

**A. Extend `CloudChatContainerProps`:**
```ts
// Before
type CloudChatContainerProps = {
  organizationId?: string;
};

// After
type CloudChatContainerProps = {
  organizationId?: string;
  sessions: StoredSession[];
  refetchSessions: () => void;
};
```

**B. Update function signature** to destructure the new props:
```ts
// Before
export function CloudChatContainer({ organizationId }: CloudChatContainerProps) {

// After
export function CloudChatContainer({ organizationId, sessions, refetchSessions }: CloudChatContainerProps) {
```

**C. Remove `useSidebarSessions` call** (lines 237–241) and its import (line 43):

Lines to delete:
```ts
// import
import { useSidebarSessions } from './hooks/useSidebarSessions';

// usage
// Sidebar sessions (scoped to organization when in org context, personal-only when undefined)
// Pass null for personal chat to filter out org sessions, or the org ID for org chat
const { sessions, refetchSessions } = useSidebarSessions({
  organizationId: organizationId ?? null,
});
```

Everything else (`handleStreamComplete` using `refetchSessions`, `useSessionDeletion` receiving
`refetchSessions`, `sessions` prop on `CloudChatPresentation`) stays exactly as-is — they simply
consume the prop value instead of the locally-derived value.

**D. Add `StoredSession` to imports** (it must be imported at the type level for the prop type):
```ts
import type { AgentMode, SessionStartConfig, StoredSession } from './types';
```
(Currently `StoredSession` is only imported inside `useSidebarSessions`, not in the container.)

---

### 4. `src/components/cloud-agent-next/CloudChatContainer.tsx`

Identical changes A–D above (different import paths, otherwise the same).

---

## What does NOT change

- `useSidebarSessions` itself — no changes.
- `CloudChatPageWrapper` / `CloudChatPageWrapperNext` — no changes; they already pass
  `organizationId` down to `CloudChatPage`, which now passes it to both `useSidebarSessions` and
  `CloudChatContainer`.
- `useSessionDeletion`, `CloudChatPresentation`, all other hooks — no changes; they continue
  receiving `refetchSessions` / `sessions` exactly as before.

---

## Why `CloudChatPage` is the right lift-point

- Zero state, zero effects, zero atoms — it re-renders only when `organizationId` changes
  (i.e. on navigation), not during the session-loading lifecycle.
- Already owns `organizationId`, so `useSidebarSessions({ organizationId: organizationId ?? null })`
  requires no new prop threading.
- Sits inside the `<Suspense>` boundary in `CloudChatPageWrapper`, which is correct — the sessions
  query should suspend/load after the Suspense boundary hydrates.
- No new files, no new abstractions, minimal diff.

---

## Expected outcome

| Scenario | Before | After |
|---|---|---|
| Dev (StrictMode on) | ~12 sub-operations in one batch | ~2 (one mount + StrictMode double) |
| Production | ~6 sub-operations in one batch | ~1 |
