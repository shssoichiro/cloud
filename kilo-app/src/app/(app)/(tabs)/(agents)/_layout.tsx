import { Stack } from 'expo-router';

import { useThemeColors } from '@/lib/hooks/use-theme-colors';

export default function AgentsLayout() {
  const colors = useThemeColors();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Agents' }} />
    </Stack>
  );
}
