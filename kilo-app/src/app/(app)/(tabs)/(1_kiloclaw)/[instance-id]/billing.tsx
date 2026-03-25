import { ExternalLink } from 'lucide-react-native';
import { Linking, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useKiloClawBillingStatus } from '@/lib/hooks/use-kiloclaw';
import { formatBillingDate } from '@/lib/hooks/use-kiloclaw-billing';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';

function PlanDetails({
  billing,
}: Readonly<{
  billing: NonNullable<ReturnType<typeof useKiloClawBillingStatus>['data']>;
}>) {
  if (billing.subscription) {
    return (
      <View className="gap-1">
        <Text className="text-base font-semibold">
          {billing.subscription.plan.charAt(0).toUpperCase() + billing.subscription.plan.slice(1)}
        </Text>
        <Text variant="muted" className="text-sm">
          Status:{' '}
          {billing.subscription.status.charAt(0).toUpperCase() +
            billing.subscription.status.slice(1)}
        </Text>
        <Text variant="muted" className="text-sm">
          Current period ends: {formatBillingDate(billing.subscription.currentPeriodEnd)}
        </Text>
        {billing.subscription.cancelAtPeriodEnd && (
          <Text className="text-sm text-destructive">Cancels at end of billing period</Text>
        )}
      </View>
    );
  }
  if (billing.trial && !billing.trial.expired) {
    return (
      <View className="gap-1">
        <Text className="text-base font-semibold">Free Trial</Text>
        <Text variant="muted" className="text-sm">
          {billing.trial.daysRemaining} day
          {billing.trial.daysRemaining === 1 ? '' : 's'} remaining
        </Text>
        <Text variant="muted" className="text-sm">
          Ends: {formatBillingDate(billing.trial.endsAt)}
        </Text>
      </View>
    );
  }
  if (billing.earlybird) {
    return (
      <View className="gap-1">
        <Text className="text-base font-semibold">Earlybird</Text>
        <Text variant="muted" className="text-sm">
          {billing.earlybird.daysRemaining} day
          {billing.earlybird.daysRemaining === 1 ? '' : 's'} remaining
        </Text>
        <Text variant="muted" className="text-sm">
          Expires: {formatBillingDate(billing.earlybird.expiresAt)}
        </Text>
      </View>
    );
  }
  return (
    <Text variant="muted" className="text-sm">
      No active plan
    </Text>
  );
}

export default function BillingScreen() {
  const colors = useThemeColors();
  const billingQuery = useKiloClawBillingStatus();
  const billing = billingQuery.data;

  if (billingQuery.isPending) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Billing" />
        <Animated.View layout={LinearTransition} className="flex-1 px-4 pt-4 gap-3">
          <Animated.View exiting={FadeOut.duration(150)}>
            <Skeleton className="h-24 w-full rounded-lg" />
          </Animated.View>
        </Animated.View>
      </View>
    );
  }

  if (!billing) {
    return;
  }

  return (
    <Animated.View layout={LinearTransition} className="flex-1 bg-background">
      <ScreenHeader title="Billing" />
      <ScrollView contentContainerClassName="gap-4 px-4 py-4" showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeIn.duration(200)} className="gap-4">
          {/* Current Plan card */}
          <View className="bg-secondary p-4 rounded-lg gap-2">
            <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Current Plan
            </Text>
            <PlanDetails billing={billing} />
          </View>

          {/* Access card */}
          <View className="bg-secondary p-4 rounded-lg gap-2">
            <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Access
            </Text>
            <View className="gap-1">
              <Text className="text-sm">{billing.hasAccess ? 'Access granted' : 'No access'}</Text>
              {billing.accessReason && (
                <Text variant="muted" className="text-sm">
                  Reason:{' '}
                  {billing.accessReason.charAt(0).toUpperCase() + billing.accessReason.slice(1)}
                </Text>
              )}
            </View>
          </View>

          {/* Manage billing button */}
          <Button
            variant="outline"
            onPress={() => {
              void Linking.openURL('https://kilo.ai/claw');
            }}
            className="flex-row gap-2"
          >
            <ExternalLink size={16} color={colors.foreground} />
            <Text className="font-medium">Manage Billing on Web</Text>
          </Button>
        </Animated.View>
      </ScrollView>
    </Animated.View>
  );
}
