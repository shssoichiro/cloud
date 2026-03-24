import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import logo from '@/../assets/images/logo.png';
import { Image } from '@/components/ui/image';
import { cn } from '@/lib/utils';

interface ProfileAvatarButtonProps {
  className?: string;
}

export function ProfileAvatarButton({ className }: Readonly<ProfileAvatarButtonProps>) {
  const router = useRouter();

  return (
    <View className={cn('mr-3', className)}>
      <Pressable
        onPress={() => {
          void Haptics.selectionAsync();
          router.push('/(app)/profile');
        }}
        accessibilityRole="button"
        accessibilityLabel="Open profile"
      >
        <Image source={logo} className="h-7 w-7" transition={0} />
      </Pressable>
    </View>
  );
}
