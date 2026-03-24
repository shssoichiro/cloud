import { Settings } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { StatusBadge } from '@/components/kiloclaw/status-badge';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';

type InstanceRowProps = {
  sandboxId: string | null;
  status: 'running' | 'stopped' | 'provisioned' | 'starting' | 'restarting' | 'destroying' | null;
  region: string | null;
  cpus: number | null;
  memoryMb: number | null;
  onPress: () => void;
  onSettingsPress: () => void;
};

export function InstanceRow({
  sandboxId,
  status,
  region,
  cpus,
  memoryMb,
  onPress,
  onSettingsPress,
}: InstanceRowProps) {
  const colors = useThemeColors();

  const specsLabel = [
    cpus ? `${cpus} vCPU` : null,
    memoryMb ? `${(memoryMb / 1024).toFixed(0)} GB` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      className="flex-row items-center gap-3 rounded-lg bg-secondary p-3 active:opacity-70"
      onPress={onPress}
      accessibilityLabel={`Instance ${sandboxId ?? 'unknown'}`}
    >
      <View className="flex-1 gap-1">
        <Text className="text-sm font-medium">{sandboxId ?? 'Instance'}</Text>
        <View className="flex-row items-center gap-2">
          <StatusBadge status={status} />
          {region && <Text className="text-xs text-muted-foreground">{region}</Text>}
          {specsLabel && <Text className="text-xs text-muted-foreground">{specsLabel}</Text>}
        </View>
      </View>
      <Pressable
        className="items-center justify-center rounded-md bg-muted p-2 active:opacity-70"
        onPress={onSettingsPress}
        accessibilityLabel="Instance settings"
        hitSlop={8}
      >
        <Settings size={18} color={colors.mutedForeground} />
      </Pressable>
    </Pressable>
  );
}
