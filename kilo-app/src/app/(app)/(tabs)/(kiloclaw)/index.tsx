import { useNavigation, useRouter } from 'expo-router';
import { useLayoutEffect } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';

export default function KiloClawInstanceList() {
  const navigation = useNavigation();
  const router = useRouter();

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'KiloClaw',
      headerRight: () => (
        <Pressable
          onPress={() => {
            router.push('/(app)/profile' as never);
          }}
          className="mr-2"
        >
          <Text className="text-xl">👤</Text>
        </Pressable>
      ),
    });
  }, [navigation, router]);

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
      <Text variant="muted">Your instances will appear here</Text>
    </View>
  );
}
