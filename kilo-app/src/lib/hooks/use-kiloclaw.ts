import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTRPC } from '@/lib/trpc';

// ── Queries ──────────────────────────────────────────────────────────

export function useKiloClawStatus(enabled = true) {
  const trpc = useTRPC();
  return useQuery(
    trpc.kiloclaw.getStatus.queryOptions(undefined, {
      enabled,
      refetchInterval: enabled ? 10_000 : false,
    })
  );
}

export function useKiloClawBillingStatus(enabled = true) {
  const trpc = useTRPC();
  return useQuery(
    trpc.kiloclaw.getBillingStatus.queryOptions(undefined, { enabled })
  );
}

export function useKiloClawConfig() {
  const trpc = useTRPC();
  return useQuery(trpc.kiloclaw.getConfig.queryOptions());
}

export function useKiloClawGatewayStatus(enabled: boolean) {
  const trpc = useTRPC();
  return useQuery(
    trpc.kiloclaw.gatewayStatus.queryOptions(undefined, {
      enabled,
      refetchInterval: enabled ? 30_000 : false,
    })
  );
}

export function useControllerVersion(enabled: boolean) {
  const trpc = useTRPC();
  return useQuery(
    trpc.kiloclaw.controllerVersion.queryOptions(undefined, {
      enabled,
      staleTime: 5 * 60_000,
    })
  );
}

export function useKiloClawServiceDegraded() {
  const trpc = useTRPC();
  return useQuery(
    trpc.kiloclaw.serviceDegraded.queryOptions(undefined, {
      staleTime: 60_000,
      refetchInterval: 60_000,
    })
  );
}

export function useKiloClawPairing(enabled = true) {
  const trpc = useTRPC();
  return useQuery(
    trpc.kiloclaw.listPairingRequests.queryOptions(undefined, {
      enabled,
      refetchInterval: enabled ? 120_000 : false,
    })
  );
}

export function useKiloClawDevicePairing(enabled = true) {
  const trpc = useTRPC();
  return useQuery(
    trpc.kiloclaw.listDevicePairingRequests.queryOptions(undefined, {
      enabled,
      refetchInterval: enabled ? 120_000 : false,
    })
  );
}

export function useKiloClawAvailableVersions(offset = 0, limit = 25) {
  const trpc = useTRPC();
  return useQuery(
    trpc.kiloclaw.listAvailableVersions.queryOptions(
      { offset, limit },
      { staleTime: 5 * 60_000 }
    )
  );
}

export function useKiloClawMyPin() {
  const trpc = useTRPC();
  return useQuery(
    trpc.kiloclaw.getMyPin.queryOptions(undefined, {
      staleTime: 60_000,
    })
  );
}

export function useKiloClawLatestVersion() {
  const trpc = useTRPC();
  return useQuery(
    trpc.kiloclaw.latestVersion.queryOptions(undefined, {
      staleTime: 60_000,
    })
  );
}

export function useKiloClawGoogleSetup(enabled: boolean) {
  const trpc = useTRPC();
  return useQuery(
    trpc.kiloclaw.getGoogleSetupCommand.queryOptions(undefined, {
      enabled,
      staleTime: 50 * 60_000,
    })
  );
}

// ── Mutations ────────────────────────────────────────────────────────

export function useKiloClawMutations() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const invalidateStatus = async () => {
    await queryClient.invalidateQueries({ queryKey: trpc.kiloclaw.getStatus.queryKey() });
    await queryClient.invalidateQueries({
      queryKey: trpc.kiloclaw.controllerVersion.queryKey(),
    });
  };

  const invalidateStatusAndBilling = async () => {
    await invalidateStatus();
    await queryClient.invalidateQueries({
      queryKey: trpc.kiloclaw.getBillingStatus.queryKey(),
    });
  };

  return {
    start: useMutation(trpc.kiloclaw.start.mutationOptions({ onSuccess: invalidateStatus })),
    stop: useMutation(trpc.kiloclaw.stop.mutationOptions({ onSuccess: invalidateStatus })),
    restartMachine: useMutation(
      trpc.kiloclaw.restartMachine.mutationOptions({
        onSuccess: async () => {
          await invalidateStatus();
          await queryClient.invalidateQueries({
            queryKey: trpc.kiloclaw.gatewayStatus.queryKey(),
          });
        },
      })
    ),
    restartOpenClaw: useMutation(
      trpc.kiloclaw.restartOpenClaw.mutationOptions({
        onSuccess: async () => {
          await invalidateStatus();
          await queryClient.invalidateQueries({
            queryKey: trpc.kiloclaw.gatewayStatus.queryKey(),
          });
        },
      })
    ),
    patchSecrets: useMutation(
      trpc.kiloclaw.patchSecrets.mutationOptions({
        onSuccess: async () => {
          await invalidateStatus();
          await queryClient.invalidateQueries({ queryKey: trpc.kiloclaw.getConfig.queryKey() });
        },
      })
    ),
    patchChannels: useMutation(
      trpc.kiloclaw.patchChannels.mutationOptions({
        onSuccess: async () => {
          await invalidateStatus();
          await queryClient.invalidateQueries({ queryKey: trpc.kiloclaw.getConfig.queryKey() });
        },
      })
    ),
    patchExecPreset: useMutation(trpc.kiloclaw.patchExecPreset.mutationOptions()),
    setMyPin: useMutation(
      trpc.kiloclaw.setMyPin.mutationOptions({
        onSuccess: async () => {
          await invalidateStatus();
          await queryClient.invalidateQueries({
            queryKey: trpc.kiloclaw.getMyPin.queryKey(),
          });
        },
      })
    ),
    removeMyPin: useMutation(
      trpc.kiloclaw.removeMyPin.mutationOptions({
        onSuccess: async () => {
          await invalidateStatus();
          await queryClient.invalidateQueries({
            queryKey: trpc.kiloclaw.getMyPin.queryKey(),
          });
        },
      })
    ),
    approvePairingRequest: useMutation(
      trpc.kiloclaw.approvePairingRequest.mutationOptions({
        onSuccess: async () => {
          await queryClient.invalidateQueries({
            queryKey: trpc.kiloclaw.listPairingRequests.queryKey(),
          });
        },
      })
    ),
    approveDevicePairingRequest: useMutation(
      trpc.kiloclaw.approveDevicePairingRequest.mutationOptions({
        onSuccess: async () => {
          await queryClient.invalidateQueries({
            queryKey: trpc.kiloclaw.listDevicePairingRequests.queryKey(),
          });
        },
      })
    ),
    disconnectGoogle: useMutation(
      trpc.kiloclaw.disconnectGoogle.mutationOptions({ onSuccess: invalidateStatus })
    ),
    setGmailNotifications: useMutation(
      trpc.kiloclaw.setGmailNotifications.mutationOptions({ onSuccess: invalidateStatus })
    ),
  };
}
