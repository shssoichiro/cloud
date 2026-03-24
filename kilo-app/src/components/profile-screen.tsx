import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Building2, KeyRound, LogOut, User } from 'lucide-react-native';
import { Alert, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth/auth-context';
import { useAppContext } from '@/lib/context/context-context';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';
import { useTRPC } from '@/lib/trpc';

function providerIcon(_provider: string) {
  return KeyRound;
}

export function ProfileScreen() {
  const { signOut } = useAuth();
  const { context, clearContext } = useAppContext();
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.user.getAuthProviders.queryOptions());
  const { data: orgs } = useQuery(trpc.organizations.list.queryOptions());
  const colors = useThemeColors();

  const contextLabel =
    context?.type === 'personal'
      ? 'Personal'
      : (orgs?.find(o => o.organizationId === context?.organizationId)?.organizationName ??
        'Organization');

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You will need to sign in again to access your workspace.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          void signOut();
        },
      },
    ]);
  };

  return (
    <View className="flex-1 bg-background px-6 pt-8">
      {/* Active context */}
      <View className="gap-3">
        <Text variant="small" className="uppercase tracking-wide text-muted-foreground">
          Active Context
        </Text>
        <View className="flex-row items-center gap-3 rounded-lg bg-secondary p-3">
          {context?.type === 'personal' ? (
            <User size={18} color={colors.secondaryForeground} />
          ) : (
            <Building2 size={18} color={colors.secondaryForeground} />
          )}
          <Text className="text-sm font-medium">{contextLabel}</Text>
        </View>
      </View>

      {/* Linked accounts */}
      <Animated.View className="mt-6 gap-3" layout={LinearTransition}>
        <Text variant="small" className="uppercase tracking-wide text-muted-foreground">
          Linked Accounts
        </Text>

        {isLoading && (
          <Animated.View className="gap-3" exiting={FadeOut.duration(150)}>
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </Animated.View>
        )}

        {data?.providers.map(p => {
          const Icon = providerIcon(p.provider);
          return (
            <Animated.View
              key={`${p.provider}-${p.email}`}
              className="flex-row items-center gap-3 rounded-lg bg-secondary p-3"
              entering={FadeIn.duration(200)}
            >
              <Icon size={18} color={colors.secondaryForeground} />
              <View className="flex-1">
                <Text className="text-sm font-medium capitalize">{p.provider}</Text>
                <Text variant="muted" className="text-xs">
                  {p.email}
                </Text>
              </View>
            </Animated.View>
          );
        })}
      </Animated.View>

      {/* Actions */}
      <View className="mt-auto gap-3 pb-8">
        <Button
          variant="outline"
          className="flex-row gap-2"
          onPress={() => {
            void clearContext();
          }}
          accessibilityLabel="Switch workspace"
        >
          <ArrowLeftRight size={16} color={colors.foreground} />
          <Text>Switch Context</Text>
        </Button>

        <Button
          variant="ghost"
          className="flex-row gap-2"
          onPress={confirmSignOut}
          accessibilityLabel="Sign out"
        >
          <LogOut size={16} color={colors.mutedForeground} />
          <Text className="text-muted-foreground">Sign Out</Text>
        </Button>
      </View>
    </View>
  );
}
