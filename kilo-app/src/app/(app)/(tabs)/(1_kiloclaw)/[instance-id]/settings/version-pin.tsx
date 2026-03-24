import { Check } from 'lucide-react-native';
import { Alert, FlatList, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import {
  useKiloClawMyPin,
  useControllerVersion,
  useKiloClawLatestVersion,
  useKiloClawAvailableVersions,
  useKiloClawMutations,
} from '@/lib/hooks/use-kiloclaw';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';

interface VersionItem {
  openclaw_version: string | null | undefined;
  variant: string | null | undefined;
  image_tag: string;
  description: string | null | undefined;
  published_at: string | null | undefined;
}

export default function VersionPinScreen() {
  const colors = useThemeColors();
  const myPinQuery = useKiloClawMyPin();
  const controllerQuery = useControllerVersion(true);
  const latestVersionQuery = useKiloClawLatestVersion();
  const availableVersionsQuery = useKiloClawAvailableVersions();
  const mutations = useKiloClawMutations();

  const isLoading =
    myPinQuery.isPending || controllerQuery.isPending || latestVersionQuery.isPending;

  if (isLoading) {
    return (
      <Animated.View layout={LinearTransition} className="flex-1 bg-background px-4 pt-4 gap-3">
        <Animated.View exiting={FadeOut.duration(150)}>
          <Skeleton className="h-16 w-full rounded-lg" />
        </Animated.View>
        <Animated.View exiting={FadeOut.duration(150)}>
          <Skeleton className="h-12 w-full rounded-lg" />
        </Animated.View>
      </Animated.View>
    );
  }

  const myPin = myPinQuery.data;
  const controllerVersion = controllerQuery.data;
  const latestVersion = latestVersionQuery.data;
  const versions = availableVersionsQuery.data?.items ?? [];

  function handleUnpin() {
    Alert.alert('Unpin Version', 'Switch back to the latest available version?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unpin',
        style: 'destructive',
        onPress: () => {
          mutations.removeMyPin.mutate();
        },
      },
    ]);
  }

  function handlePin(item: VersionItem) {
    const versionLabel = item.openclaw_version ?? item.image_tag;
    Alert.alert('Pin Version', `Pin your instance to version ${versionLabel}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Pin',
        onPress: () => {
          mutations.setMyPin.mutate({ imageTag: item.image_tag });
        },
      },
    ]);
  }

  function renderVersionItem({ item }: { item: VersionItem }) {
    const isPinned = myPin?.image_tag === item.image_tag;
    const dateStr = item.published_at
      ? new Date(item.published_at).toLocaleDateString()
      : undefined;

    return (
      <View>
        <Animated.View>
          <View className="flex-row items-center gap-3 px-4 py-3">
            <View className="flex-1 gap-0.5">
              <Text className="text-sm font-medium">{item.openclaw_version ?? item.image_tag}</Text>
              {Boolean(dateStr ?? item.variant) && (
                <Text variant="muted" className="text-xs">
                  {[dateStr, item.variant].filter(Boolean).join(' · ')}
                </Text>
              )}
            </View>
            {isPinned ? (
              <Check size={18} color={colors.foreground} />
            ) : (
              <Button
                size="sm"
                variant="outline"
                onPress={() => {
                  handlePin(item);
                }}
              >
                <Text>Pin</Text>
              </Button>
            )}
          </View>
        </Animated.View>
      </View>
    );
  }

  return (
    <Animated.View layout={LinearTransition} className="flex-1 bg-background">
      <FlatList
        data={versions}
        keyExtractor={item => item.image_tag}
        renderItem={renderVersionItem}
        contentContainerClassName="px-4 py-4 gap-4"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <Animated.View entering={FadeIn.duration(200)} className="gap-4 mb-2">
            <View className="rounded-lg bg-secondary p-4 gap-3">
              <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Current Version
              </Text>
              {controllerVersion ? (
                <View className="gap-1">
                  <Text className="text-sm font-medium">
                    {controllerVersion.version ?? 'Unknown'}
                  </Text>
                  {controllerVersion.openclawVersion && (
                    <Text variant="muted" className="text-xs">
                      OpenClaw: {controllerVersion.openclawVersion}
                    </Text>
                  )}
                </View>
              ) : (
                <Text variant="muted" className="text-sm">
                  Version info unavailable
                </Text>
              )}

              <View className="flex-row items-center justify-between">
                <Text variant="muted" className="text-xs flex-1">
                  {myPin
                    ? `Pinned to ${myPin.openclaw_version ?? myPin.image_tag}`
                    : 'Using latest'}
                </Text>
                {myPin && (
                  <Button size="sm" variant="outline" onPress={handleUnpin}>
                    <Text>Unpin</Text>
                  </Button>
                )}
              </View>

              {latestVersion && (
                <Text variant="muted" className="text-xs">
                  Latest available: {latestVersion.openclawVersion}
                </Text>
              )}
            </View>

            {versions.length > 0 && (
              <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Available Versions
              </Text>
            )}
          </Animated.View>
        }
        ItemSeparatorComponent={() => <View className="h-px bg-border mx-4" />}
        ListEmptyComponent={
          availableVersionsQuery.isPending ? (
            <Skeleton className="h-12 w-full rounded-lg" />
          ) : undefined
        }
        className="rounded-lg bg-secondary"
      />
    </Animated.View>
  );
}
