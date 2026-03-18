'use client';

import { useState } from 'react';
import { AlertCircle, Check, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useReadFile, type useKiloClawMutations } from '@/hooks/useKiloClaw';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type ExecPreset = 'always-ask' | 'never-ask';

function execPresetToConfig(preset: ExecPreset): { security: string; ask: string } {
  switch (preset) {
    case 'never-ask':
      return { security: 'full', ask: 'off' };
    case 'always-ask':
    default:
      return { security: 'allowlist', ask: 'on-miss' };
  }
}

function mergeExecPreset(
  currentConfig: Record<string, unknown>,
  preset: ExecPreset
): Record<string, unknown> {
  const tools = (currentConfig.tools ?? {}) as Record<string, unknown>;
  const exec = (tools.exec ?? {}) as Record<string, unknown>;
  return {
    ...currentConfig,
    tools: {
      ...tools,
      exec: { ...exec, ...execPresetToConfig(preset) },
    },
  };
}

const OPENCLAW_CONFIG_PATH = 'openclaw.json';

type ClawMutations = ReturnType<typeof useKiloClawMutations>;

export function PermissionStep({
  instanceRunning,
  mutations,
  onComplete,
}: {
  instanceRunning: boolean;
  mutations: ClawMutations;
  onComplete: () => void;
}) {
  const [preset, setPreset] = useState<ExecPreset | null>(null);

  // Only fetch config when the instance is running AND user picked "never-ask"
  // (the only case where we need to patch).
  const needsPatch = preset === 'never-ask';
  const { data: fileData, refetch } = useReadFile(
    OPENCLAW_CONFIG_PATH,
    instanceRunning && needsPatch
  );

  const isApplying = mutations.writeFile.isPending;
  const canContinue = instanceRunning && preset !== null && !isApplying;

  function handleContinue() {
    if (!preset) return;

    // "always-ask" is the default — no patch needed
    if (preset === 'always-ask') {
      onComplete();
      return;
    }

    // "never-ask" — patch the config
    if (!fileData) {
      toast.error('Config not loaded yet — please try again in a moment');
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(fileData.content);
    } catch {
      toast.error('Failed to parse config — please try again');
      return;
    }

    const currentConfig = (
      typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {}
    ) as Record<string, unknown>;

    const merged = mergeExecPreset(currentConfig, preset);
    mutations.writeFile.mutate(
      { path: OPENCLAW_CONFIG_PATH, content: JSON.stringify(merged, null, 2), etag: fileData.etag },
      {
        onSuccess: () => onComplete(),
        onError: (err: {
          message: string;
          data?: { code?: string; upstreamCode?: string } | null;
        }) => {
          if (err.data?.code === 'CONFLICT') {
            void refetch();
            toast.error('Config was modified externally — please try again');
          } else {
            toast.error(err.message);
          }
        },
      }
    );
  }

  return (
    <Card className="mt-6">
      <CardContent className="flex flex-col gap-6 p-6 sm:p-8">
        {/* Step indicator */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              Step 2 of 3
            </span>
            <div className="flex gap-1">
              <span className="h-1.5 w-6 rounded-full bg-blue-500" />
              <span className="h-1.5 w-6 rounded-full bg-blue-500" />
              <span className="bg-muted h-1.5 w-6 rounded-full" />
            </div>
          </div>
          <h2 className="text-foreground text-2xl font-bold">Set Bot Permissions</h2>
          <p className="text-muted-foreground text-sm">
            Choose how your KiloClaw bot handles actions on your behalf.
          </p>
        </div>

        {/* Permission cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PresetCard
            selected={preset === 'never-ask'}
            onClick={() => setPreset('never-ask')}
            icon={<ShieldAlert className="h-5 w-5 text-amber-400" />}
            iconBg="bg-amber-900/50"
            title="Allow everything"
            description="The bot acts immediately without asking. Best for autonomous workflows, but review what it can access first."
            caution="Use with caution"
          />
          <PresetCard
            selected={preset === 'always-ask'}
            onClick={() => setPreset('always-ask')}
            icon={<ShieldCheck className="h-5 w-5 text-emerald-400" />}
            iconBg="bg-emerald-900/50"
            title="Ask for permission"
            description="The bot pauses and asks you before taking any action. Best when you want full control over what it does."
            badge="Recommended"
          />
        </div>

        {/* Provisioning status banner */}
        {!instanceRunning && (
          <div className="border-border flex w-full items-center gap-3 rounded-lg border p-4">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <div>
              <p className="text-sm font-semibold">Setting up your instance</p>
              <p className="text-muted-foreground text-xs">
                This happens in the background — keep going while we get things ready.
              </p>
            </div>
          </div>
        )}

        <Button className="w-full py-6 text-base" disabled={!canContinue} onClick={handleContinue}>
          {isApplying ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Applying...
            </>
          ) : (
            'Continue'
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function PresetCard({
  selected,
  onClick,
  icon,
  iconBg,
  title,
  description,
  badge,
  caution,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  badge?: string;
  caution?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex cursor-pointer flex-col gap-4 rounded-xl border p-5 text-left transition-colors',
        selected
          ? 'border-blue-500 bg-blue-950/40'
          : 'border-border hover:border-muted-foreground/40'
      )}
    >
      {/* Top row: icon + badge/checkmark */}
      <div className="flex items-start justify-between">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', iconBg)}>
          {icon}
        </div>
        {selected ? (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500">
            <Check className="h-3.5 w-3.5 text-white" />
          </div>
        ) : badge ? (
          <span className="rounded-full border border-emerald-700 px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-emerald-400 uppercase">
            {badge}
          </span>
        ) : null}
      </div>

      {/* Title + description */}
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-bold">{title}</p>
        <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
      </div>

      {/* Caution label */}
      {caution && (
        <div className="flex items-center gap-1.5 text-amber-400">
          <AlertCircle className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">{caution}</span>
        </div>
      )}
    </button>
  );
}
