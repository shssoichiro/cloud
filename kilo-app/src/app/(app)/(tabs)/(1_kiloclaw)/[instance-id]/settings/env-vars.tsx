import { Key } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { EmptyState } from '@/components/empty-state';
import { ScreenHeader } from '@/components/screen-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useKiloClawConfig } from '@/lib/hooks/use-kiloclaw';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';

export default function EnvVarsScreen() {
  const colors = useThemeColors();
  const configQuery = useKiloClawConfig();
  const config = configQuery.data;

  if (configQuery.isPending) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Environment Variables" />
        <Animated.View layout={LinearTransition} className="flex-1 px-4 pt-4 gap-3">
          <Animated.View exiting={FadeOut.duration(150)}>
            <Skeleton className="h-12 w-full rounded-lg" />
          </Animated.View>
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

  const envVarKeys = config?.envVarKeys ?? [];

  if (envVarKeys.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Environment Variables" />
        <Animated.View
          entering={FadeIn.duration(200)}
          className="flex-1 items-center justify-center"
        >
          <EmptyState
            icon={Key}
            title="No environment variables"
            description="Environment variables configured for this instance will appear here."
          />
        </Animated.View>
      </View>
    );
  }

  return (
    <Animated.View layout={LinearTransition} className="flex-1 bg-background">
      <ScreenHeader title="Environment Variables" />
      <ScrollView contentContainerClassName="px-4 py-4 gap-4" showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeIn.duration(200)} className="gap-3">
          <View className="rounded-lg bg-secondary overflow-hidden">
            {envVarKeys.map((key, index) => (
              <View key={key}>
                {index > 0 && <View className="ml-4 h-px bg-border" />}
                <View className="flex-row items-center gap-3 px-4 py-3">
                  <Key size={14} color={colors.mutedForeground} />
                  <Text className="flex-1 font-mono text-sm">{key}</Text>
                </View>
              </View>
            ))}
          </View>
          <Text variant="muted" className="text-xs text-center">
            {envVarKeys.length} environment variable{envVarKeys.length === 1 ? '' : 's'}
          </Text>
        </Animated.View>
      </ScrollView>
    </Animated.View>
  );
}
