# Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the app from a single home screen to a 2-tab chat-first layout with context selection, profile modal, and placeholder screens for all features.

**Architecture:** Root layout gains a 3-way auth/context gate. `(app)` becomes a Stack wrapping a Tabs group (2 tabs: KiloClaw, Agents) plus a Profile modal. Each tab has its own Stack for push navigation. ContextProvider mirrors AuthProvider's pattern (SecureStore + React context).

**Tech Stack:** Expo Router (file-based routing), expo-secure-store, @tanstack/react-query, tRPC, NativeWind v5, react-native-reusables UI components

**Spec:** `docs/superpowers/specs/2026-03-24-navigation-design.md`

**Checks:** `pnpm format && pnpm typecheck && pnpm lint && pnpm check:unused`

---

## File Map

### New Files

| File                                                         | Responsibility                                                                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/context/context-context.tsx`                        | ContextProvider — stores org/personal selection in SecureStore, exposes `context`, `isLoading`, `setContext()`, `clearContext()` |
| `src/app/(context)/_layout.tsx`                              | Slot layout for context selection group                                                                                          |
| `src/app/(context)/select.tsx`                               | Context picker route (thin — renders component)                                                                                  |
| `src/components/context-select-screen.tsx`                   | Context picker UI — fetches `organizations.list`, shows personal + orgs                                                          |
| `src/app/(app)/profile.tsx`                                  | Profile modal route (thin — renders component)                                                                                   |
| `src/components/profile-screen.tsx`                          | Profile UI — user info, context display, switch context, sign out                                                                |
| `src/app/(app)/(tabs)/_layout.tsx`                           | Tabs navigator — 2 tabs: KiloClaw, Agents                                                                                        |
| `src/app/(app)/(tabs)/(kiloclaw)/_layout.tsx`                | Stack for KiloClaw tab                                                                                                           |
| `src/app/(app)/(tabs)/(kiloclaw)/index.tsx`                  | Instance list route (placeholder)                                                                                                |
| `src/app/(app)/(tabs)/(agents)/_layout.tsx`                  | Stack for Agents tab                                                                                                             |
| `src/app/(app)/(tabs)/(agents)/index.tsx`                    | Agent sessions list route (placeholder)                                                                                          |
| `src/app/(app)/(tabs)/(kiloclaw)/[instanceId]/index.tsx`     | Chat screen stub (WIP)                                                                                                           |
| `src/app/(app)/(tabs)/(kiloclaw)/[instanceId]/dashboard.tsx` | Instance dashboard stub (WIP)                                                                                                    |
| `src/app/(app)/(tabs)/(agents)/[sessionId].tsx`              | Agent session detail stub (WIP)                                                                                                  |

### Modified Files

| File                            | Change                                                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/_layout.tsx`           | Add ContextProvider to provider tree, update redirect logic to 3-way gate (no token → auth, token + no context → context picker, both → app) |
| `src/app/(app)/_layout.tsx`     | Change from plain Stack to Stack with `(tabs)` group + `profile` modal screen                                                                |
| `src/lib/auth/auth-context.tsx` | `signOut()` also deletes `app-context` key from SecureStore                                                                                  |

### Deleted Files

| File                      | Reason                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `src/app/(app)/index.tsx` | Replaced by tab structure — home screen functionality moves to profile + instance list |

---

## Task 1: ContextProvider

**Files:**

- Create: `src/lib/context/context-context.tsx`

- [ ] **Step 1: Create ContextProvider**

```tsx
// src/lib/context/context-context.tsx
import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { queryClient } from '@/lib/query-client';

const CONTEXT_KEY = 'app-context';

type AppContext =
  | {
      type: 'personal';
    }
  | {
      type: 'organization';
      organizationId: string;
    };

type ContextValue = {
  context: AppContext | undefined;
  isLoading: boolean;
  setContext: (ctx: AppContext) => Promise<void>;
  clearContext: () => Promise<void>;
};

const AppContextContext = createContext<ContextValue | undefined>(undefined);

export function ContextProvider({ children }: { readonly children: ReactNode }) {
  const [context, setContextState] = useState<AppContext | undefined>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const stored = await SecureStore.getItemAsync(CONTEXT_KEY);
        if (stored) {
          setContextState(JSON.parse(stored) as AppContext);
        }
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, []);

  const setContext = useCallback(async (ctx: AppContext) => {
    await SecureStore.setItemAsync(CONTEXT_KEY, JSON.stringify(ctx));
    setContextState(ctx);
  }, []);

  const clearContext = useCallback(async () => {
    await SecureStore.deleteItemAsync(CONTEXT_KEY);
    queryClient.clear();
    setContextState(undefined);
  }, []);

  const value = useMemo<ContextValue>(
    () => ({ context, isLoading, setContext, clearContext }),
    [context, isLoading, setContext, clearContext]
  );

  return <AppContextContext value={value}>{children}</AppContextContext>;
}

export function useAppContext(): ContextValue {
  const ctx = useContext(AppContextContext);
  if (!ctx) {
    throw new Error('useAppContext must be used within a ContextProvider');
  }
  return ctx;
}
```

- [ ] **Step 2: Run checks**

```bash
pnpm format && pnpm typecheck && pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/context/context-context.tsx
git commit -m "feat(kilo-app): add ContextProvider for org/personal selection"
```

---

## Task 2: Update signOut to clear context

**Files:**

- Modify: `src/lib/auth/auth-context.tsx`

- [ ] **Step 1: Update signOut**

In `src/lib/auth/auth-context.tsx`, update the `signOut` callback to also delete the context key:

```tsx
const signOut = useCallback(async () => {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync('app-context');
  queryClient.clear();
  setToken(undefined);
}, []);
```

- [ ] **Step 2: Run checks**

```bash
pnpm format && pnpm typecheck && pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/auth-context.tsx
git commit -m "feat(kilo-app): signOut clears both auth token and app context"
```

---

## Task 3: Context selection screen

**Files:**

- Create: `src/app/(context)/_layout.tsx`
- Create: `src/app/(context)/select.tsx`
- Create: `src/components/context-select-screen.tsx`

- [ ] **Step 1: Create context group layout**

```tsx
// src/app/(context)/_layout.tsx
import { Slot } from 'expo-router';

export default function ContextLayout() {
  return <Slot />;
}
```

- [ ] **Step 2: Create context select route**

```tsx
// src/app/(context)/select.tsx
import { ContextSelectScreen } from '@/components/context-select-screen';

export default function ContextSelectRoute() {
  return <ContextSelectScreen />;
}
```

- [ ] **Step 3: Create ContextSelectScreen component**

This screen fetches `organizations.list` and shows personal + org options. Use existing `Button` and `Text` components.

```tsx
// src/components/context-select-screen.tsx
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
            key={org.id}
            size="lg"
            variant="outline"
            onPress={() => {
              handleOrganization(org.id);
            }}
          >
            <Text>{org.name}</Text>
          </Button>
        ))}
      </View>
    </View>
  );
}
```

> **Note:** The exact shape of `organizations.list` response should be verified during implementation. The web app uses `trpc.organizations.list.queryOptions()` which returns objects with at least `id` and `name` fields. Adjust the component if the shape differs.

- [ ] **Step 4: Run checks**

```bash
pnpm format && pnpm typecheck && pnpm lint
```

- [ ] **Step 5: Commit**

```bash
git add src/app/\(context\)/ src/components/context-select-screen.tsx
git commit -m "feat(kilo-app): add context selection screen for org/personal picker"
```

---

## Task 4: Update root layout — 3-way gate + ContextProvider

**Files:**

- Modify: `src/app/_layout.tsx`

- [ ] **Step 1: Add ContextProvider and update redirect logic**

Replace the full content of `src/app/_layout.tsx`:

```tsx
import '../global.css';

import { PortalHost } from '@rn-primitives/portal';
import { QueryClientProvider } from '@tanstack/react-query';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Toaster } from 'sonner-native';

import { AuthProvider, useAuth } from '@/lib/auth/auth-context';
import { ContextProvider, useAppContext } from '@/lib/context/context-context';
import { queryClient } from '@/lib/query-client';
import { TRPCProvider, trpcClient } from '@/lib/trpc';

void SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { token, isLoading: authLoading } = useAuth();
  const { context, isLoading: contextLoading } = useAppContext();
  const segments = useSegments();
  const router = useRouter();

  const isLoading = authLoading || contextLoading;
  const inAuthGroup = segments[0] === '(auth)';
  const inContextGroup = segments[0] === '(context)';

  useEffect(() => {
    if (isLoading) return;

    if (!token) {
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      } else {
        void SplashScreen.hideAsync();
      }
    } else if (!context) {
      if (!inContextGroup) {
        router.replace('/(context)/select');
      } else {
        void SplashScreen.hideAsync();
      }
    } else if (inAuthGroup || inContextGroup) {
      router.replace('/(app)');
    } else {
      void SplashScreen.hideAsync();
    }
  }, [token, context, isLoading, inAuthGroup, inContextGroup, router]);

  const needsRedirect =
    !isLoading &&
    ((!token && !inAuthGroup) ||
      (token && !context && !inContextGroup) ||
      (token && context && (inAuthGroup || inContextGroup)));

  if (isLoading || needsRedirect) {
    return;
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView className="flex-1">
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ContextProvider>
              <RootLayoutNav />
              <Toaster />
              <PortalHost />
            </ContextProvider>
          </AuthProvider>
        </QueryClientProvider>
      </TRPCProvider>
    </GestureHandlerRootView>
  );
}
```

- [ ] **Step 2: Run checks**

```bash
pnpm format && pnpm typecheck && pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add src/app/_layout.tsx
git commit -m "feat(kilo-app): 3-way auth/context gate in root layout"
```

---

## Task 5: Tab structure + (app) layout

**Files:**

- Modify: `src/app/(app)/_layout.tsx`
- Create: `src/app/(app)/(tabs)/_layout.tsx`
- Create: `src/app/(app)/(tabs)/(kiloclaw)/_layout.tsx`
- Create: `src/app/(app)/(tabs)/(kiloclaw)/index.tsx`
- Create: `src/app/(app)/(tabs)/(agents)/_layout.tsx`
- Create: `src/app/(app)/(tabs)/(agents)/index.tsx`
- Delete: `src/app/(app)/index.tsx`

- [ ] **Step 1: Update (app) layout to Stack with modal support**

```tsx
// src/app/(app)/_layout.tsx
import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="profile"
        options={{ presentation: 'modal', headerShown: true, headerTitle: 'Profile' }}
      />
    </Stack>
  );
}
```

- [ ] **Step 2: Create Tabs layout**

```tsx
// src/app/(app)/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: 'hsl(0, 0%, 98%)',
        tabBarInactiveTintColor: 'hsl(0, 0%, 45%)',
        tabBarStyle: {
          backgroundColor: 'hsl(0, 0%, 3.9%)',
          borderTopColor: 'hsl(0, 0%, 14.9%)',
        },
      }}
    >
      <Tabs.Screen
        name="(kiloclaw)"
        options={{
          title: 'KiloClaw',
          tabBarIcon: ({ color }) => (
            <Text className="text-xl" style={{ color }}>
              💬
            </Text>
          ),
        }}
      />
      <Tabs.Screen
        name="(agents)"
        options={{
          title: 'Agents',
          tabBarIcon: ({ color }) => (
            <Text className="text-xl" style={{ color }}>
              🤖
            </Text>
          ),
        }}
      />
    </Tabs>
  );
}
```

> **Note:** The tab bar and header colors are hardcoded to dark theme HSL values. This is a known limitation — navigator options don't support `className`, so inline style values are required here. Improve later with `useColorScheme()` + a color mapping to support light/dark dynamically. The `tabBarIcon` callback requires a `style` prop for the dynamic `color` — this is an acceptable exception to the no-inline-styles rule. The emoji icons are placeholders — replace with proper icons (e.g., from `lucide-react-native` or custom SVGs) in a future task.

- [ ] **Step 3: Create KiloClaw stack layout**

```tsx
// src/app/(app)/(tabs)/(kiloclaw)/_layout.tsx
import { Stack } from 'expo-router';

export default function KiloClawLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: 'hsl(0, 0%, 3.9%)' },
        headerTintColor: 'hsl(0, 0%, 98%)',
      }}
    />
  );
}
```

- [ ] **Step 4: Create KiloClaw instance list placeholder**

```tsx
// src/app/(app)/(tabs)/(kiloclaw)/index.tsx
import { View } from 'react-native';

import { Text } from '@/components/ui/text';

export default function KiloClawInstanceList() {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
      <Text variant="h2">KiloClaw</Text>
      <Text variant="muted">Your instances will appear here</Text>
    </View>
  );
}
```

- [ ] **Step 5: Create Agents stack layout**

```tsx
// src/app/(app)/(tabs)/(agents)/_layout.tsx
import { Stack } from 'expo-router';

export default function AgentsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: 'hsl(0, 0%, 3.9%)' },
        headerTintColor: 'hsl(0, 0%, 98%)',
      }}
    />
  );
}
```

- [ ] **Step 6: Create Agents session list placeholder**

```tsx
// src/app/(app)/(tabs)/(agents)/index.tsx
import { View } from 'react-native';

import { Text } from '@/components/ui/text';

export default function AgentSessionList() {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
      <Text variant="h2">Cloud Agents</Text>
      <Text variant="muted">Your agent sessions will appear here</Text>
    </View>
  );
}
```

- [ ] **Step 7: Delete old home screen**

```bash
rm src/app/\(app\)/index.tsx
```

- [ ] **Step 8: Run checks**

```bash
pnpm format && pnpm typecheck && pnpm lint
```

- [ ] **Step 9: Commit**

```bash
git add -A src/app/\(app\)/
git commit -m "feat(kilo-app): add 2-tab layout with KiloClaw and Agents stacks"
```

---

## Task 6: WIP stub screens for deferred features

**Files:**

- Create: `src/app/(app)/(tabs)/(kiloclaw)/[instanceId]/index.tsx`
- Create: `src/app/(app)/(tabs)/(kiloclaw)/[instanceId]/dashboard.tsx`
- Create: `src/app/(app)/(tabs)/(agents)/[sessionId].tsx`

- [ ] **Step 1: Create chat stub**

```tsx
// src/app/(app)/(tabs)/(kiloclaw)/[instanceId]/index.tsx
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';

export default function ChatScreen() {
  const { instanceId } = useLocalSearchParams<{ instanceId: string }>();

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
      <Text variant="h2">Chat</Text>
      <Text variant="muted">Instance: {instanceId}</Text>
      <Text variant="muted">Coming soon</Text>
    </View>
  );
}
```

- [ ] **Step 2: Create dashboard stub**

```tsx
// src/app/(app)/(tabs)/(kiloclaw)/[instanceId]/dashboard.tsx
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';

export default function DashboardScreen() {
  const { instanceId } = useLocalSearchParams<{ instanceId: string }>();

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
      <Text variant="h2">Dashboard</Text>
      <Text variant="muted">Instance: {instanceId}</Text>
      <Text variant="muted">Coming soon</Text>
    </View>
  );
}
```

- [ ] **Step 3: Create agent session detail stub**

```tsx
// src/app/(app)/(tabs)/(agents)/[sessionId].tsx
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';

export default function SessionDetailScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
      <Text variant="h2">Agent Session</Text>
      <Text variant="muted">Session: {sessionId}</Text>
      <Text variant="muted">Coming soon</Text>
    </View>
  );
}
```

- [ ] **Step 4: Run checks**

```bash
pnpm format && pnpm typecheck && pnpm lint
```

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/\(tabs\)/\(kiloclaw\)/\[instanceId\]/ src/app/\(app\)/\(tabs\)/\(agents\)/\[sessionId\].tsx
git commit -m "feat(kilo-app): add WIP stub screens for chat, dashboard, and session detail"
```

---

## Task 7: Profile modal screen

**Files:**

- Create: `src/app/(app)/profile.tsx`
- Create: `src/components/profile-screen.tsx`

- [ ] **Step 1: Create profile route**

```tsx
// src/app/(app)/profile.tsx
import { ProfileScreen } from '@/components/profile-screen';

export default function ProfileRoute() {
  return <ProfileScreen />;
}
```

- [ ] **Step 2: Create ProfileScreen component**

This migrates the useful parts from the old home screen (auth providers, sign out) and adds context display + switch.

```tsx
// src/components/profile-screen.tsx
import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth/auth-context';
import { useAppContext } from '@/lib/context/context-context';
import { useTRPC } from '@/lib/trpc';

export function ProfileScreen() {
  const { signOut } = useAuth();
  const { context, clearContext } = useAppContext();
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.user.getAuthProviders.queryOptions());

  const contextLabel = context?.type === 'personal' ? 'Personal' : 'Organization';

  return (
    <View className="flex-1 gap-8 bg-background px-6 pt-16">
      <View className="items-center gap-1">
        <Text variant="muted">Context: {contextLabel}</Text>
      </View>

      {isLoading && <Text variant="muted">Loading account info...</Text>}

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

      <View className="gap-3">
        <Button
          variant="outline"
          onPress={() => {
            void clearContext();
          }}
        >
          <Text>Switch Context</Text>
        </Button>

        <Button
          variant="destructive"
          onPress={() => {
            void signOut();
          }}
        >
          <Text>Sign Out</Text>
        </Button>
      </View>
    </View>
  );
}
```

> **Note:** The `contextLabel` for organizations should ideally show the org name. This requires either storing the name alongside the ID in SecureStore, or fetching it. For now, "Organization" is a placeholder — improve when building the real instance list (which will have org data available).

- [ ] **Step 3: Run checks**

```bash
pnpm format && pnpm typecheck && pnpm lint
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/profile.tsx src/components/profile-screen.tsx
git commit -m "feat(kilo-app): add profile modal with context switch and sign out"
```

---

## Task 8: Header avatar button for profile access

**Files:**

- Modify: `src/app/(app)/(tabs)/(kiloclaw)/index.tsx`
- Modify: `src/app/(app)/(tabs)/(agents)/index.tsx`

- [ ] **Step 1: Add header right button to KiloClaw instance list**

Update `src/app/(app)/(tabs)/(kiloclaw)/index.tsx` — use `useLayoutEffect` + `navigation.setOptions` to add the avatar button to the header:

```tsx
// src/app/(app)/(tabs)/(kiloclaw)/index.tsx
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
            router.push('/(app)/profile');
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
```

- [ ] **Step 2: Add header right button to Agents session list**

Same pattern for `src/app/(app)/(tabs)/(agents)/index.tsx`:

```tsx
// src/app/(app)/(tabs)/(agents)/index.tsx
import { useNavigation, useRouter } from 'expo-router';
import { useLayoutEffect } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';

export default function AgentSessionList() {
  const navigation = useNavigation();
  const router = useRouter();

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Agents',
      headerRight: () => (
        <Pressable
          onPress={() => {
            router.push('/(app)/profile');
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
      <Text variant="muted">Your agent sessions will appear here</Text>
    </View>
  );
}
```

- [ ] **Step 3: Run checks**

```bash
pnpm format && pnpm typecheck && pnpm lint
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/\(tabs\)/
git commit -m "feat(kilo-app): add profile avatar button to tab screen headers"
```

---

## Task 9: Final verification

- [ ] **Step 1: Run full check suite**

```bash
pnpm format && pnpm typecheck && pnpm lint && pnpm check:unused
```

- [ ] **Step 2: Fix any issues found**

Address any type errors, lint violations, or unused exports.

- [ ] **Step 3: Manual smoke test**

Verify with the running dev server (user starts it):

1. App launches → shows login (if no token) or context picker (if token, no context)
2. After login + context selection → lands on KiloClaw tab
3. Bottom tab bar shows KiloClaw and Agents tabs, switching works
4. Avatar icon in header opens Profile as a modal
5. "Switch Context" in Profile returns to context picker
6. "Sign Out" in Profile returns to login

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -u
git commit -m "fix(kilo-app): address lint and type issues from navigation refactor"
```
