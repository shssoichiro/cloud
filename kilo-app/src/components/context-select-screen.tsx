import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';

import logo from '@/../assets/images/logo.png';
import { Button } from '@/components/ui/button';
import { Image } from '@/components/ui/image';
import { Text } from '@/components/ui/text';
import { useAppContext } from '@/lib/context/context-context';
import { useTRPC } from '@/lib/trpc';

export function ContextSelectScreen() {
  const { setContext } = useAppContext();
  const trpc = useTRPC();
  const { data, isLoading, error, refetch } = useQuery(trpc.organizations.list.queryOptions());

  const handlePersonal = () => {
    void setContext({ type: 'personal' });
  };

  const handleOrganization = (organizationId: string) => {
    void setContext({ type: 'organization', organizationId });
  };

  return (
    <View className="flex-1 items-center justify-center gap-8 bg-background px-6">
      <View className="items-center gap-3">
        <Image source={logo} className="h-16 w-16" />
        <Text variant="h2">Choose Context</Text>
        <Text variant="muted">Select which workspace to use</Text>
      </View>

      <View className="w-full max-w-sm gap-3">
        <Button size="lg" variant="outline" onPress={handlePersonal}>
          <Text>Personal</Text>
        </Button>

        {isLoading && <Text variant="muted">Loading organizations...</Text>}

        {error && (
          <View className="items-center gap-2">
            <Text className="text-sm text-destructive">Failed to load organizations</Text>
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
                void refetch();
              }}
            >
              <Text>Retry</Text>
            </Button>
          </View>
        )}

        {data?.map(org => (
          <Button
            key={org.organizationId}
            size="lg"
            variant="outline"
            onPress={() => {
              handleOrganization(org.organizationId);
            }}
          >
            <Text>{org.organizationName}</Text>
          </Button>
        ))}
      </View>
    </View>
  );
}
