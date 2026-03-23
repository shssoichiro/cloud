# AGENTS.md

## What This Is

Kilo App is an Expo (React Native) mobile application using Expo Router for file-based routing.

## Tech Stack

- **Framework**: Expo SDK 55, React Native, React 19
- **Routing**: Expo Router (file-based, `src/app/`)
- **Language**: TypeScript (strict mode, `tsgo`)
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
```

## Installing Dependencies

Always use `npx expo install` to add packages — it resolves versions compatible with the current Expo SDK. Do not use `pnpm add` directly.

```bash
npx expo install <package-name>
npx expo install --dev <package-name>   # devDependencies
```

## Code Style

- Expo Router requires default exports in `src/app/` — this is the only place default exports are allowed.
- Prefer `type` over `interface`.
- No inline styles or color literals in components — use the theme system in `src/constants/theme.ts`.
- All lint rules are set to `error`, not `warn`. Fix violations, don't suppress them.

## Fixing Lint Errors

When resolving lint errors, always try the autofix first before editing manually:

```bash
npx eslint --fix <file-or-directory>
```

Only hand-fix errors that `--fix` cannot resolve.

## Change Checklist

Before submitting any change:

1. Run `pnpm typecheck && pnpm lint`
2. Do not suppress lint rules without justification
3. Keep route files in `src/app/` thin — extract logic into `src/components/` or `src/hooks/`
