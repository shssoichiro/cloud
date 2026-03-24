import '../global.css';

import { PortalHost } from '@rn-primitives/portal';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Toaster } from 'sonner-native';

import { AuthProvider, useAuth } from '@/lib/auth/auth-context';

void SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { token, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!token && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (token && inAuthGroup) {
      router.replace('/(app)');
    }

    void SplashScreen.hideAsync();
  }, [token, isLoading, segments, router]);

  if (isLoading) {
    return;
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView className="flex-1">
      <AuthProvider>
        <RootLayoutNav />
        <Toaster />
        <PortalHost />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
