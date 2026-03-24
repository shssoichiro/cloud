import { Stack } from 'expo-router';

import { useThemeColors } from '@/lib/hooks/use-theme-colors';

export default function AppLayout() {
  const colors = useThemeColors();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="profile"
        options={{
          presentation: 'modal',
          headerShown: true,
          headerTitle: 'Profile',
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.foreground,
        }}
      />
    </Stack>
  );
}
