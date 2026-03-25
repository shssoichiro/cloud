import { Lock, ShieldCheck, ShieldOff } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { EmptyState } from '@/components/empty-state';
import { ScreenHeader } from '@/components/screen-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useKiloClawConfig } from '@/lib/hooks/use-kiloclaw';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';

export default function SecretsScreen() {
  const colors = useThemeColors();
  const configQuery = useKiloClawConfig();
  const config = configQuery.data;

  if (configQuery.isPending) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Secrets" />
        <Animated.View layout={LinearTransition} className="flex-1 px-4 pt-4 gap-3">
          <Animated.View exiting={FadeOut.duration(150)}>
            <Skeleton className="h-12 w-full rounded-lg" />
          </Animated.View>
          <Animated.View exiting={FadeOut.duration(150)}>
            <Skeleton className="h-12 w-full rounded-lg" />
          </Animated.View>
        </Animated.View>
      </View>
    );
  }

  const entries = Object.entries(config?.configuredSecrets ?? {});

  if (entries.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Secrets" />
        <Animated.View
          entering={FadeIn.duration(200)}
          className="flex-1 items-center justify-center"
        >
          <EmptyState
            icon={Lock}
            title="No secrets"
            description="Secrets configured for this instance will appear here."
          />
        </Animated.View>
      </View>
    );
  }

  return (
    <Animated.View layout={LinearTransition} className="flex-1 bg-background">
      <ScreenHeader title="Secrets" />
      <ScrollView contentContainerClassName="px-4 py-4 gap-4" showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeIn.duration(200)} className="gap-3">
          <View className="rounded-lg bg-secondary overflow-hidden">
            {entries.map(([key, configured], index) => (
              <View key={key}>
                {index > 0 && <View className="ml-4 h-px bg-border" />}
                <View className="flex-row items-center gap-3 px-4 py-3">
                  {configured ? (
                    <ShieldCheck size={18} color={colors.foreground} />
                  ) : (
                    <ShieldOff size={18} color={colors.mutedForeground} />
                  )}
                  <View className="flex-1 gap-0.5">
                    <Text className="text-sm font-medium">{key}</Text>
                    <Text variant="muted" className="text-xs">
                      {configured ? 'Configured' : 'Not set'}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
          <Text variant="muted" className="text-xs text-center">
            {config?.secretCount ?? entries.length} secret
            {(config?.secretCount ?? entries.length) === 1 ? '' : 's'}
          </Text>
        </Animated.View>
      </ScrollView>
    </Animated.View>
  );
}
