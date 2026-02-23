'use client';

import { useState } from 'react';
import { Play, RefreshCw, RotateCw, Stethoscope } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { toast } from 'sonner';
import type { KiloClawDashboardStatus } from '@/lib/kiloclaw/types';
import { Button } from '@/components/ui/button';
import type { useKiloClawMutations } from '@/hooks/useKiloClaw';
import { RunDoctorDialog } from './RunDoctorDialog';

type ClawMutations = ReturnType<typeof useKiloClawMutations>;

export function InstanceControls({
  status,
  mutations,
}: {
  status: KiloClawDashboardStatus;
  mutations: ClawMutations;
}) {
  const posthog = usePostHog();
  const isRunning = status.status === 'running';
  const isStopped = status.status === 'stopped' || status.status === 'provisioned';
  const isDestroying = status.status === 'destroying';
  const [doctorOpen, setDoctorOpen] = useState(false);

  return (
    <div>
      <h3 className="text-foreground mb-1 text-sm font-medium">Instance Controls</h3>
      <p className="text-muted-foreground mb-4 text-xs">
        Manage power state and gateway lifecycle.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
          disabled={!isStopped || mutations.start.isPending || isDestroying}
          onClick={() => {
            posthog?.capture('claw_start_instance_clicked', { instance_status: status.status });
            mutations.start.mutate();
          }}
        >
          <Play className="h-4 w-4" />
          {mutations.start.isPending ? 'Starting...' : 'Start Machine'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-violet-500/30 text-violet-400 hover:bg-violet-500/10 hover:text-violet-300"
          disabled={!isRunning || mutations.restartOpenClaw.isPending || isDestroying}
          onClick={() => {
            posthog?.capture('claw_restart_openclaw_clicked', {
              instance_status: status.status,
            });
            mutations.restartOpenClaw.mutate(undefined, {
              onSuccess: () => toast.success('OpenClaw restarting'),
              onError: err => toast.error(err.message),
            });
          }}
        >
          <RefreshCw className="h-4 w-4" />
          {mutations.restartOpenClaw.isPending ? 'Restarting...' : 'Restart OpenClaw'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
          disabled={!isRunning || mutations.restartGateway.isPending || isDestroying}
          onClick={() => {
            posthog?.capture('claw_redeploy_clicked', { instance_status: status.status });
            mutations.restartGateway.mutate(undefined, {
              onSuccess: () => toast.success('Gateway restarting'),
              onError: err => toast.error(err.message),
            });
          }}
        >
          <RotateCw className="h-4 w-4" />
          {mutations.restartGateway.isPending ? 'Redeploying...' : 'Redeploy'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300"
          disabled={!isRunning || mutations.runDoctor.isPending || isDestroying}
          onClick={() => {
            posthog?.capture('claw_doctor_clicked', { instance_status: status.status });
            setDoctorOpen(true);
          }}
        >
          <Stethoscope className="h-4 w-4" />
          OpenClaw Doctor
        </Button>
      </div>
      <RunDoctorDialog
        open={doctorOpen}
        onOpenChange={setDoctorOpen}
        mutation={mutations.runDoctor}
      />
    </div>
  );
}
