import {
  Activity,
  Cpu,
  Globe,
  HardDrive,
  MapPin,
  MemoryStick,
  RotateCcw,
  Server,
} from 'lucide-react-native';
import { type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { StatusBadge } from '@/components/kiloclaw/status-badge';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';

type StatusCardProps = {
  status: 'running' | 'stopped' | 'provisioned' | 'starting' | 'restarting' | 'destroying' | null;
  sandboxId: string | null;
  region: string | null;
  cpus: number | null;
  memoryMb: number | null;
  gatewayState: 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed' | 'shutting_down' | null;
  uptime: number | null;
  restarts: number | null;
  lastExitCode: number | null;
  lastExitSignal: string | null;
};

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

type DetailRowProps = {
  icon: LucideIcon;
  label: string;
  value: string;
};

function DetailRow({ icon: Icon, label, value }: DetailRowProps) {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center gap-3 py-2">
      <Icon size={16} color={colors.mutedForeground} />
      <Text className="flex-1 text-sm text-muted-foreground">{label}</Text>
      <Text className="text-sm font-medium">{value}</Text>
    </View>
  );
}

export function StatusCard({
  status,
  sandboxId,
  region,
  cpus,
  memoryMb,
  gatewayState,
  uptime,
  restarts,
  lastExitCode,
  lastExitSignal,
}: StatusCardProps) {
  const memoryLabel = memoryMb ? `${(memoryMb / 1024).toFixed(0)} GB` : '—';
  const cpuLabel = cpus ? `${cpus} vCPU` : '—';

  const lastExitLabel =
    lastExitCode !== null
      ? `Code ${lastExitCode}${lastExitSignal ? ` (${lastExitSignal})` : ''}`
      : lastExitSignal
        ? lastExitSignal
        : null;

  return (
    <View className="rounded-lg bg-secondary p-4 gap-1">
      <View className="flex-row items-center justify-between pb-2">
        <Text className="text-sm font-semibold">{sandboxId ?? 'Instance'}</Text>
        <StatusBadge status={status} />
      </View>

      {region && <DetailRow icon={MapPin} label="Region" value={region} />}
      <DetailRow icon={Cpu} label="CPU" value={cpuLabel} />
      <DetailRow icon={MemoryStick} label="Memory" value={memoryLabel} />
      <DetailRow icon={HardDrive} label="Storage" value="10 GB SSD" />

      {gatewayState !== null && (
        <View className="mt-2 border-t border-border pt-2 gap-1">
          <Text className="text-xs font-semibold text-muted-foreground pb-1">Gateway Process</Text>
          <DetailRow icon={Activity} label="State" value={gatewayState} />
          {uptime !== null && (
            <DetailRow icon={Globe} label="Uptime" value={formatUptime(uptime)} />
          )}
          {restarts !== null && (
            <DetailRow icon={RotateCcw} label="Restarts" value={String(restarts)} />
          )}
          {lastExitLabel && (
            <DetailRow icon={Server} label="Last Exit" value={lastExitLabel} />
          )}
        </View>
      )}
    </View>
  );
}
