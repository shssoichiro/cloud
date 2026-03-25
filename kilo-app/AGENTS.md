# AGENTS.md

## What This Is

Kilo App is an Expo (React Native) mobile application using Expo Router for file-based routing. It lives as a subpackage (`kilo-app/`) in the `cloud` monorepo. **This app targets iOS and Android only — never web.** Do not add `Platform.select({ web: ... })` patterns or web-specific code.

## Tech Stack

- **Framework**: Expo SDK 55, React Native, React 19
- **Routing**: Expo Router (file-based, `src/app/`)
- **Language**: TypeScript (strict mode, `tsgo`)
- **Styling**: NativeWind v5 (Tailwind CSS v4) — docs: https://www.nativewind.dev/v5/llms-full.txt
- **UI Components**: [React Native Reusables](https://reactnativereusables.com/) (shadcn/ui for React Native) in `src/components/ui/`
- **Linting**: ESLint 9 flat config with strict type-checked rules, unicorn, sonarjs, import-x, promise, react-native
- **Formatting**: oxfmt

## Environment Setup

Follow the official Expo guide to set up the development environment: https://docs.expo.dev/get-started/set-up-your-environment/

The dev server (`pnpm start`) is always started by the user — do not start it yourself.

## Commands

```bash
pnpm typecheck       # tsgo --noEmit
pnpm lint            # expo lint (eslint)
pnpm format          # oxfmt src
pnpm format:check    # oxfmt --list-different src
pnpm check:unused    # knip (unused exports/deps)
```

## Installing Dependencies

Always use `npx expo install` to add packages — it resolves versions compatible with the current Expo SDK. Do not use `pnpm add` directly.

```bash
npx expo install <package-name>
npx expo install --dev <package-name>   # devDependencies
```

## Data Fetching

- When you need data from the backend, **always add a new tRPC procedure** rather than copying data or inventing client-side alternatives. The app uses tRPC with React Query — adding a procedure is cheap and keeps the source of truth on the server.
- When a component takes backend data as props, derive the prop types from the tRPC router's return types (e.g., `NonNullable<ReturnType<typeof useMyQuery>['data']>`) instead of manually copying type definitions. This keeps types in sync with the backend automatically.

### Mutations

- Every mutation must include an `onError` handler that shows a toast (`toast.error(error.message)` via `sonner-native`). Silent failures are not acceptable — users must always see feedback when something goes wrong.
- Centralize `onError` in the mutation hook (e.g., `useKiloClawMutations`) rather than in individual components. Components can add their own `onSuccess` callbacks via `mutate(input, { onSuccess })` for UI-specific behavior (e.g., closing a form, clearing fields).
- For screens with text inputs, use `KeyboardAwareScrollView` from `react-native-keyboard-controller` instead of plain `ScrollView`. Set `bottomOffset` to ensure inputs and action buttons remain visible above the keyboard.

## Code Style

- Expo Router requires default exports in `src/app/` — this is the only place default exports are allowed.
- Prefer `type` over `interface`.
- Import `View`, `Text`, `ScrollView`, `Pressable`, `TextInput` from `react-native` — NativeWind's Metro plugin rewrites these imports to add `className` support automatically.
- Import `Image` from `@/components/ui/image` (a `styled` wrapper around `expo-image`). Lint enforces this.
- For UI components (Button, Text with variants, Card, etc.), import from `@/components/ui/<component>`. These are from react-native-reusables (shadcn/ui for RN).
- Add new UI components with `pnpm dlx @react-native-reusables/cli@latest add <component> --styling-library nativewind -y`. Then fix import ordering and any lint issues in the generated file.
- The `cn()` helper for merging Tailwind classes is in `@/lib/utils`.
- Design tokens (colors, radii) are CSS variables in `src/global.css` with `@theme inline` for Tailwind v4. The theme uses shadcn/ui neutral palette with light/dark via `prefers-color-scheme`.
- Style components with Tailwind utility classes via `className`. No inline styles or `StyleSheet.create`.
- All lint rules are set to `error`, not `warn`. Fix violations, don't suppress them.
- `as never` is a code smell — it silences all type checking. For Expo Router dynamic paths, use `as Href` instead (import `Href` from `expo-router`). If you find yourself needing `as never`, the types are wrong and need fixing.

## UX Patterns

### Icons

- Use `lucide-react-native` for all icons. Never use emoji as UI elements.
- Lucide icons on native do NOT support `className` for color. Always use the `color` prop with resolved color strings from `useThemeColors()`: `<Icon size={18} color={colors.foreground} />`.

### Navigation Headers

- **Always use `ScreenHeader`** (`src/components/screen-header.tsx`) instead of native stack headers. Set `headerShown: false` on all Stack navigators.
- `ScreenHeader` auto-detects whether a back button is needed via `router.canGoBack()` — no manual configuration required.
- Place `ScreenHeader` as the first child inside the screen's root `View`, above any `ScrollView`. The header handles safe area insets and should not scroll with content.
- Pass optional `headerRight` for action buttons (e.g., profile avatar on tab root screens).

### Loading States

- Never show bare "Loading..." text. Use the `Skeleton` component (`src/components/ui/skeleton.tsx`) for shimmer placeholders.
- **Match skeleton dimensions exactly** to the loaded content (e.g., if a button is `h-11 rounded-md`, the skeleton should be `h-11 rounded-md`). Mismatched heights cause layout shift.
- Use `ActivityIndicator` from `react-native` for inline spinners (e.g., waiting for an API call to initiate).

### Animations & Reducing Layout Shift

- `react-native-reanimated` is available. Use `FadeIn`/`FadeOut` entering/exiting animations to smooth state transitions (e.g., login states, content loading).
- Use `LinearTransition` (not the deprecated `Layout`) on container `Animated.View` to animate height changes when children appear/disappear (e.g., skeleton → loaded content).
- Wrap each dynamically appearing item in `<Animated.View entering={FadeIn.duration(200)}>` to fade in instead of popping.
- **Skeleton → content swap pattern**: Wrap skeletons in `<Animated.View exiting={FadeOut.duration(150)}>` and loaded items in `<Animated.View entering={FadeIn.duration(200)}>`, with `LinearTransition` on the parent container. This gives a smooth crossfade with no jump.

### Empty States

- Use the `EmptyState` component (`src/components/empty-state.tsx`) for screens with no data. It takes a Lucide icon, title, and description.

### Confirmations

- Use native `Alert.alert()` for destructive confirmations (e.g., sign out). It renders the platform alert dialog — no JS-based modal needed.

### Tabs

- Set `freezeOnBlur: true` on tab `screenOptions` to prevent re-render flicker when switching tabs.
- Use `expo-haptics` (`Haptics.selectionAsync()`) on tab press and interactive buttons for tactile feedback.

### Images

- When using `expo-image` in headers or small UI elements, set `transition={0}` to disable the default fade-in which causes flicker.

## Fixing Lint Errors

When resolving lint errors, always try the autofix first before editing manually:

```bash
npx eslint --fix <file-or-directory>
```

Only hand-fix errors that `--fix` cannot resolve.

## Change Checklist

Before pushing, run all checks and fix any issues:

```bash
pnpm format && pnpm typecheck && pnpm lint && pnpm check:unused
```

- Do not suppress lint rules without justification.
- Keep route files in `src/app/` thin — extract logic into `src/components/` or `src/hooks/`.
- Never commit plans, specs, design docs, or other non-code markdown files to this repo.
