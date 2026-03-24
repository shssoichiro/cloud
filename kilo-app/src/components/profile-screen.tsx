import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, KeyRound, LogOut } from 'lucide-react-native';
import { Alert, View } from 'react-native';

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
  const colors = useThemeColors();

  const contextLabel = context?.type === 'personal' ? 'Personal' : 'Organization';

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
          <Text className="text-sm font-medium">{contextLabel}</Text>
        </View>
      </View>

      {/* Linked accounts */}
      <View className="mt-6 gap-3">
        <Text variant="small" className="uppercase tracking-wide text-muted-foreground">
          Linked Accounts
        </Text>

        {isLoading && (
          <View className="gap-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </View>
        )}

        {data?.providers.map(p => {
          const Icon = providerIcon(p.provider);
          return (
            <View
              key={`${p.provider}-${p.email}`}
              className="flex-row items-center gap-3 rounded-lg bg-secondary p-3"
            >
              <Icon size={18} color={colors.secondaryForeground} />
              <View className="flex-1">
                <Text className="text-sm font-medium capitalize">{p.provider}</Text>
                <Text variant="muted" className="text-xs">
                  {p.email}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

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
