# Generic Tool Card — Unified Collapsible Tool Card (V2 only)

## Goal

Replace `McpToolCard` and the `ToolExecutionCard` fallback in `PartRenderer` with a single `GenericToolCard` — a collapsible card with friendly tool names for known MCP tools.

V1 (`cloud-agent/`) components are out of scope.

## Files

| File                                                  | Action                                                 |
| ----------------------------------------------------- | ------------------------------------------------------ |
| `src/components/cloud-agent-next/GenericToolCard.tsx` | **Create** — new unified collapsible card              |
| `src/components/cloud-agent-next/PartRenderer.tsx`    | **Edit** — route `mcp` + fallback to `GenericToolCard` |
| `src/components/cloud-agent-next/McpToolCard.tsx`     | **Delete** — fully replaced                            |

### Not touched

- `src/components/cloud-agent-next/ToolExecutionCard.tsx` — only used by dead-code `MessageContent.tsx`; leave as-is
- All specialized cards: `ReadToolCard`, `EditToolCard`, `BashToolCard`, `WriteToolCard`, `GlobToolCard`, `GrepToolCard`, `WebSearchToolCard`, `ListToolCard`, `TodoReadToolCard`, `TodoWriteToolCard`, `QuestionToolCard`, `ChildSessionSection`
- V1 `cloud-agent/` components
- `hasRequiredInput()` in `PartRenderer` — the `mcp` case and `default` case stay unchanged

## GenericToolCard.tsx design

### Collapsed state (default)

```
[StatusIcon] Publish Image                    [v]
```

### Expanded state

```
[StatusIcon] Publish Image                    [^]
─────────────────────────────────────────────────
Arguments:
  { "sourcePath": "48207341-.../99d064b2-...jpg" }

Result:
  https://assets-dev.kiloapps.io/user_.../99d064b2-...jpg
```

### Props

Accepts `ToolPart` directly — no V1 `ToolExecution` conversion needed.

```ts
type GenericToolCardProps = {
  toolPart: ToolPart;
};
```

### Name resolution logic

1. For MCP tools (`toolPart.tool === 'mcp'`): build key `"${server_name}/${tool_name}"`, look up in a known-tools map.
2. Known mappings:
   - `"app-builder-images/transfer_image"` → `"Publish Image"`
   - `"app-builder-images/get_image"` → `"Analyze Image"`
3. Unknown MCP tools: fall back to `"server_name/tool_name"` (raw).
4. For non-MCP tools (the fallback path): use `toolPart.tool` as-is.

### Visual pattern

Same `border-muted bg-muted/30 rounded-md border` collapsible pattern used by `ReadToolCard` and the current `McpToolCard` — not the heavier `Card`/`CardHeader`/`Badge` pattern from `ToolExecutionCard`.

### Features carried over from ToolExecutionCard

- Duration display (from completed/error `state.time`)
- Attachments display (from completed `state.attachments`)
- Running/pending status text

### Status indicators

| Status                | Indicator                                                                     |
| --------------------- | ----------------------------------------------------------------------------- |
| `completed`           | muted foreground text label (e.g. tool name) — same pattern as `ReadToolCard` |
| `error`               | red `XCircle` icon                                                            |
| `pending` / `running` | blue spinning `Loader2` icon                                                  |

## PartRenderer.tsx changes

### Imports

```diff
- import { ToolExecutionCard } from './ToolExecutionCard';
- import { McpToolCard } from './McpToolCard';
+ import { GenericToolCard } from './GenericToolCard';
```

### ToolPartRenderer body

- Remove the `if (part.tool === 'mcp') { return <McpToolCard ... /> }` branch.
- Replace the bottom fallback block (which currently converts `ToolPart` → `ToolExecution` and passes to `<ToolExecutionCard>`) with:

```tsx
return <GenericToolCard toolPart={part} />;
```

This covers both MCP tools and any unknown tool type that doesn't have a specialized card.
