import { Monitor } from 'lucide-react-native';
import { Alert, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { EmptyState } from '@/components/empty-state';
import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useKiloClawDevicePairing, useKiloClawMutations } from '@/lib/hooks/use-kiloclaw';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';

export default function DevicePairingScreen() {
  const colors = useThemeColors();
  const pairingQuery = useKiloClawDevicePairing();
  const mutations = useKiloClawMutations();

  if (pairingQuery.isPending) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Device Pairing" />
        <Animated.View layout={LinearTransition} className="flex-1 px-4 pt-4 gap-3">
          <Animated.View exiting={FadeOut.duration(150)}>
            <Skeleton className="h-16 w-full rounded-lg" />
          </Animated.View>
        </Animated.View>
      </View>
    );
  }

  const requests = pairingQuery.data?.requests ?? [];

  if (requests.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Device Pairing" />
        <Animated.View
          entering={FadeIn.duration(200)}
          className="flex-1 items-center justify-center"
        >
          <EmptyState
            icon={Monitor}
            title="No pairing requests"
            description="Device pairing requests will appear here."
          />
        </Animated.View>
      </View>
    );
  }

  function handleApprove(requestId: string, platform = 'Unknown device') {
    Alert.alert('Approve Device', `Allow ${platform} to connect to your instance?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve',
        onPress: () => {
          mutations.approveDevicePairingRequest.mutate({ requestId });
        },
      },
    ]);
  }

  return (
    <Animated.View layout={LinearTransition} className="flex-1 bg-background">
      <ScreenHeader title="Device Pairing" />
      <ScrollView contentContainerClassName="px-4 py-4 gap-4" showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeIn.duration(200)}>
          <View className="rounded-lg bg-secondary overflow-hidden">
            {requests.map((request, index) => (
              <View key={request.requestId}>
                {index > 0 && <View className="ml-4 h-px bg-border" />}
                <View className="flex-row items-center gap-3 px-4 py-3">
                  <Monitor size={18} color={colors.foreground} />
                  <View className="flex-1 gap-0.5">
                    <Text className="text-sm font-medium">
                      {request.platform ?? 'Unknown device'}
                    </Text>
                    {request.role && (
                      <Text variant="muted" className="text-xs">
                        Role: {request.role}
                      </Text>
                    )}
                  </View>
                  <Button
                    size="sm"
                    onPress={() => {
                      handleApprove(request.requestId, request.platform);
                    }}
                  >
                    <Text>Approve</Text>
                  </Button>
                </View>
              </View>
            ))}
          </View>
        </Animated.View>
      </ScrollView>
    </Animated.View>
  );
}
