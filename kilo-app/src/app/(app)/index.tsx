import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth/auth-context';
import { useTRPC } from '@/lib/trpc';
import { View } from '@/tw';

function getNameFromToken(token: string): string | undefined {
  try {
    const payload = token.split('.')[1];
    if (!payload) return undefined;
    const decoded = JSON.parse(atob(payload)) as { name?: string };
    return decoded.name;
  } catch {
    return undefined;
  }
}

export default function HomeScreen() {
  const { token, signOut } = useAuth();
  const name = token ? getNameFromToken(token) : undefined;

  const trpc = useTRPC();
  const { data, isLoading, error } = useQuery(trpc.user.getAuthProviders.queryOptions());

  return (
    <View className="flex-1 items-center justify-center gap-6 bg-background px-6">
      <Text variant="h1">{name ? `${name}, welcome to Kilo!` : 'Welcome to Kilo!'}</Text>

      {isLoading && <Text variant="muted">Loading account info...</Text>}

      {error && <Text variant="muted">Failed to load account info</Text>}

      {data?.providers && (
        <View className="gap-2">
          <Text variant="large">Linked accounts</Text>
          {data.providers.map(p => (
            <Text key={`${p.provider}-${p.email}`} variant="muted">
              {p.provider}: {p.email}
            </Text>
          ))}
        </View>
      )}

      <Button
        variant="outline"
        onPress={() => {
          void signOut();
        }}
      >
        <Text>Sign Out</Text>
      </Button>
    </View>
  );
}
