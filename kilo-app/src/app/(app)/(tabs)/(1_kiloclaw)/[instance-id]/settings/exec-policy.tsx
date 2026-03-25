import { Shield } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { ScreenHeader } from '@/components/screen-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useKiloClawConfig, useKiloClawMutations } from '@/lib/hooks/use-kiloclaw';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';
import { cn } from '@/lib/utils';

type ExecPreset = 'always-ask' | 'never-ask';

interface PolicyOption {
  id: ExecPreset;
  label: string;
  description: string;
  security: string;
  ask: string;
}

const POLICY_OPTIONS: PolicyOption[] = [
  {
    id: 'always-ask',
    label: 'Always Ask',
    description: 'Confirm every command before execution. Most secure.',
    security: 'ask',
    ask: 'true',
  },
  {
    id: 'never-ask',
    label: 'Never Ask',
    description: 'Execute commands without confirmation. Faster but less safe.',
    security: 'open',
    ask: 'false',
  },
];

export default function ExecPolicyScreen() {
  const colors = useThemeColors();
  const configQuery = useKiloClawConfig();
  const mutations = useKiloClawMutations();

  const [selected, setSelected] = useState<ExecPreset | undefined>();

  if (configQuery.isPending) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Execution Policy" />
        <Animated.View layout={LinearTransition} className="flex-1 px-4 pt-4 gap-3">
          <Animated.View exiting={FadeOut.duration(150)}>
            <Skeleton className="h-16 w-full rounded-lg" />
          </Animated.View>
          <Animated.View exiting={FadeOut.duration(150)}>
            <Skeleton className="h-16 w-full rounded-lg" />
          </Animated.View>
        </Animated.View>
      </View>
    );
  }

  function handleSelect(option: PolicyOption) {
    setSelected(option.id);
    mutations.patchExecPreset.mutate({ security: option.security, ask: option.ask });
  }

  return (
    <Animated.View layout={LinearTransition} className="flex-1 bg-background">
      <ScreenHeader title="Execution Policy" />
      <ScrollView contentContainerClassName="px-4 py-4 gap-4" showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeIn.duration(200)} className="gap-3">
          {POLICY_OPTIONS.map(option => {
            const isSelected = selected === option.id;
            return (
              <Pressable
                key={option.id}
                className={cn(
                  'rounded-lg bg-secondary p-4 gap-3 border-2 active:opacity-70',
                  isSelected ? 'border-primary bg-primary/10' : 'border-transparent'
                )}
                onPress={() => {
                  handleSelect(option);
                }}
              >
                <View className="flex-row items-center gap-3">
                  <Shield size={20} color={isSelected ? colors.primary : colors.mutedForeground} />
                  <Text className="flex-1 text-base font-semibold">{option.label}</Text>
                  <View
                    className={cn(
                      'h-5 w-5 rounded-full border-2',
                      isSelected
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground bg-transparent'
                    )}
                  />
                </View>
                <Text variant="muted" className="text-sm">
                  {option.description}
                </Text>
              </Pressable>
            );
          })}

          {mutations.patchExecPreset.isPending && (
            <Animated.View entering={FadeIn.duration(200)}>
              <Text variant="muted" className="text-sm text-center">
                Saving...
              </Text>
            </Animated.View>
          )}
        </Animated.View>
      </ScrollView>
    </Animated.View>
  );
}
