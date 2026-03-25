import { MessageSquare } from 'lucide-react-native';
import { Alert, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import {
  useKiloClawStatus,
  useKiloClawPairing,
  useKiloClawMutations,
} from '@/lib/hooks/use-kiloclaw';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';

const CHANNEL_LABELS: Record<string, string> = {
  telegram: 'Telegram',
  discord: 'Discord',
  slack: 'Slack',
  github: 'GitHub',
};

export default function ChannelsScreen() {
  const colors = useThemeColors();
  const statusQuery = useKiloClawStatus();
  const pairingQuery = useKiloClawPairing();
  const mutations = useKiloClawMutations();

  const isLoading = statusQuery.isPending || pairingQuery.isPending;

  if (isLoading) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Channels" />
        <Animated.View layout={LinearTransition} className="flex-1 px-4 pt-4 gap-3">
          <Animated.View exiting={FadeOut.duration(150)}>
            <Skeleton className="h-16 w-full rounded-lg" />
          </Animated.View>
        </Animated.View>
      </View>
    );
  }

  const channelCount = statusQuery.data?.channelCount ?? 0;
  const pairingRequests = pairingQuery.data?.requests ?? [];

  function handleApprove(channel: string, code: string) {
    const label = CHANNEL_LABELS[channel] ?? channel;
    Alert.alert(
      'Approve Pairing Request',
      `Allow ${label} (code: ${code}) to connect to your instance?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: () => {
            mutations.approvePairingRequest.mutate({ channel, code });
          },
        },
      ]
    );
  }

  return (
    <Animated.View layout={LinearTransition} className="flex-1 bg-background">
      <ScreenHeader title="Channels" />
      <ScrollView contentContainerClassName="px-4 py-4 gap-4" showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeIn.duration(200)} className="gap-4">
          <View className="rounded-lg bg-secondary p-4 gap-2">
            <Text className="text-base font-semibold">
              {channelCount} channel{channelCount === 1 ? '' : 's'} connected
            </Text>
            <Text variant="muted" className="text-sm">
              Manage channel tokens on the web dashboard.
            </Text>
          </View>

          {pairingRequests.length > 0 && (
            <View className="gap-3">
              <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Pending Pairing Requests
              </Text>
              <View className="rounded-lg bg-secondary overflow-hidden">
                {pairingRequests.map((request, index) => (
                  <View key={`${request.channel}-${request.code}`}>
                    {index > 0 && <View className="ml-4 h-px bg-border" />}
                    <View className="flex-row items-center gap-3 px-4 py-3">
                      <MessageSquare size={18} color={colors.foreground} />
                      <View className="flex-1 gap-0.5">
                        <Text className="text-sm font-medium">
                          {CHANNEL_LABELS[request.channel] ?? request.channel}
                        </Text>
                        <Text variant="muted" className="text-xs">
                          Code: {request.code}
                        </Text>
                      </View>
                      <Button
                        size="sm"
                        onPress={() => {
                          handleApprove(request.channel, request.code);
                        }}
                      >
                        <Text>Approve</Text>
                      </Button>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </Animated.View>
  );
}
