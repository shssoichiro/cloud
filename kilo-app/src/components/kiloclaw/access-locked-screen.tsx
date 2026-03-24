import { useRouter } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { Linking, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { type ClawLockReason } from '@/lib/hooks/use-kiloclaw-billing';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';

const LOCK_MESSAGES: Record<string, { title: string; description: string }> = {
  trial_expired_instance_alive: {
    title: 'Trial Expired',
    description: 'Your free trial has ended. Subscribe to continue using KiloClaw.',
  },
  trial_expired_instance_destroyed: {
    title: 'Trial Expired',
    description:
      'Your free trial has ended and your instance was removed. Subscribe to create a new one.',
  },
  earlybird_expired: {
    title: 'Earlybird Access Expired',
    description: 'Your earlybird access has ended. Subscribe to continue.',
  },
  subscription_expired_instance_alive: {
    title: 'Subscription Expired',
    description: 'Your subscription has ended. Resubscribe to regain access.',
  },
  subscription_expired_instance_destroyed: {
    title: 'Subscription Expired',
    description:
      'Your subscription has ended and your instance was removed. Resubscribe to create a new one.',
  },
  past_due_grace_exceeded: {
    title: 'Payment Required',
    description: 'Your payment is past due. Please update your payment method.',
  },
  no_access: {
    title: 'Access Denied',
    description: 'You do not have access to this KiloClaw instance.',
  },
};

export function AccessLockedScreen({ reason }: Readonly<{ reason: NonNullable<ClawLockReason> }>) {
  const colors = useThemeColors();
  const router = useRouter();
  const message = LOCK_MESSAGES[reason] ?? LOCK_MESSAGES.no_access;

  return (
    <View className="flex-1 items-center justify-center gap-6 bg-background px-6">
      <View className="items-center justify-center rounded-full bg-muted p-4">
        <Lock size={32} color={colors.mutedForeground} />
      </View>
      <View className="items-center gap-2">
        <Text variant="h3" className="text-center">
          {message.title}
        </Text>
        <Text variant="muted" className="text-center">
          {message.description}
        </Text>
      </View>
      <View className="w-full gap-3">
        <Button
          onPress={() => {
            void Linking.openURL('https://kilo.ai/claw');
          }}
        >
          <Text className="text-primary-foreground font-medium">Manage Billing on Web</Text>
        </Button>
        <Button
          variant="outline"
          onPress={() => {
            router.back();
          }}
        >
          <Text className="font-medium">Go Back</Text>
        </Button>
      </View>
    </View>
  );
}
