import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface ProfileAvatarButtonProps {
  className?: string;
}

export function ProfileAvatarButton({ className }: Readonly<ProfileAvatarButtonProps>) {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        router.push('/(app)/profile' as never);
      }}
      className={cn('mr-2', className)}
      accessibilityRole="button"
      accessibilityLabel="Open profile"
    >
      <View className="h-8 w-8 items-center justify-center rounded-full bg-secondary">
        <Text className="text-xs font-semibold text-secondary-foreground">K</Text>
      </View>
    </Pressable>
  );
}
