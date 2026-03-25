import { Check, ChevronDown, ChevronUp, MessageSquare, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import {
  useKiloClawChannelCatalog,
  useKiloClawMutations,
  useKiloClawPairing,
} from '@/lib/hooks/use-kiloclaw';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';

type CatalogChannel = NonNullable<ReturnType<typeof useKiloClawChannelCatalog>['data']>[number];

const CHANNEL_LABELS: Record<string, string> = {
  telegram: 'Telegram',
  discord: 'Discord',
  slack: 'Slack',
  github: 'GitHub',
};

function ChannelCard({
  channel,
  mutations,
}: Readonly<{
  channel: CatalogChannel;
  mutations: ReturnType<typeof useKiloClawMutations>;
}>) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  const isSaving = mutations.patchSecrets.isPending;

  const filledFields = channel.fields.filter(f => (fieldValues[f.key] ?? '').trim().length > 0);
  const canSave = channel.allFieldsRequired
    ? filledFields.length === channel.fields.length
    : filledFields.length > 0;

  function handleSave() {
    const secrets: Record<string, string> = {};
    for (const f of channel.fields) {
      const val = (fieldValues[f.key] ?? '').trim();
      if (val) secrets[f.key] = val;
    }
    mutations.patchSecrets.mutate(
      { secrets },
      {
        onSuccess: () => {
          setFieldValues({});
          setExpanded(false);
        },
      }
    );
  }

  function handleRemove() {
    Alert.alert(
      'Disconnect Channel',
      `Remove ${channel.label}? This channel will be disconnected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            const secrets: Record<string, null> = {};
            for (const f of channel.fields) {
              secrets[f.key] = null;
            }
            mutations.patchSecrets.mutate({ secrets });
          },
        },
      ]
    );
  }

  return (
    <View className="rounded-lg bg-secondary mx-4 overflow-hidden">
      {/* Header row */}
      <View className="flex-row items-center gap-3 px-4 py-3">
        <View className="flex-1 gap-0.5">
          <Text className="text-sm font-medium">{channel.label}</Text>
          {channel.helpText && (
            <Text className="text-xs text-muted-foreground">{channel.helpText}</Text>
          )}
        </View>
        {channel.configured ? (
          <View className="rounded-full bg-green-500/15 px-2 py-0.5">
            <Text className="text-xs font-medium text-green-600 dark:text-green-400">
              Connected
            </Text>
          </View>
        ) : (
          <View className="rounded-full bg-muted px-2 py-0.5">
            <Text className="text-xs text-muted-foreground">Not connected</Text>
          </View>
        )}
      </View>

      {/* Action buttons */}
      <View className="flex-row gap-2 px-4 pb-3">
        {channel.configured ? (
          <>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onPress={() => {
                setExpanded(prev => !prev);
              }}
            >
              {expanded ? (
                <ChevronUp size={14} color={colors.foreground} />
              ) : (
                <ChevronDown size={14} color={colors.foreground} />
              )}
              <Text className="text-xs">{expanded ? 'Cancel' : 'Update Token'}</Text>
            </Button>
            <Button variant="destructive" size="sm" onPress={handleRemove}>
              <Trash2 size={14} color="white" />
              <Text className="text-xs text-destructive-foreground">Remove</Text>
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onPress={() => {
              setExpanded(prev => !prev);
            }}
          >
            {expanded ? (
              <ChevronUp size={14} color={colors.foreground} />
            ) : (
              <ChevronDown size={14} color={colors.foreground} />
            )}
            <Text className="text-xs">{expanded ? 'Cancel' : 'Connect'}</Text>
          </Button>
        )}
      </View>

      {/* Expandable token input area */}
      {expanded && (
        <Animated.View entering={FadeIn.duration(150)} className="border-t border-border">
          <View className="px-4 py-3 gap-3">
            {channel.allFieldsRequired && channel.fields.length > 1 && (
              <Text className="text-xs text-muted-foreground">
                All fields are required to connect {channel.label}.
              </Text>
            )}
            {channel.fields.map(field => (
              <View key={field.key} className="gap-1.5">
                <Text className="text-xs font-medium text-muted-foreground">{field.label}</Text>
                <TextInput
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                  placeholder={channel.configured ? field.placeholderConfigured : field.placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  value={fieldValues[field.key] ?? ''}
                  onChangeText={val => {
                    setFieldValues(prev => ({ ...prev, [field.key]: val }));
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
              </View>
            ))}
            <Button size="sm" disabled={!canSave || isSaving} onPress={handleSave}>
              <Check size={14} color={colors.primaryForeground} />
              <Text className="text-xs text-primary-foreground">Save</Text>
            </Button>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

export default function ChannelsScreen() {
  const colors = useThemeColors();
  const catalogQuery = useKiloClawChannelCatalog();
  const pairingQuery = useKiloClawPairing();
  const mutations = useKiloClawMutations();

  const isLoading = catalogQuery.isPending;
  const pairingRequests = pairingQuery.data?.requests ?? [];

  function handleApprove(channel: string, code: string) {
    const label = CHANNEL_LABELS[channel] ?? channel;
    Alert.alert(
      'Approve Pairing Request',
      `Allow ${label} (code: ${code}) to connect to your instance?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: () => {
            mutations.approvePairingRequest.mutate({ channel, code });
          },
        },
      ]
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Channels" />
      <Animated.View layout={LinearTransition} className="flex-1">
        <ScrollView contentContainerClassName="py-4 gap-4" showsVerticalScrollIndicator={false}>
          {isLoading ? (
            <Animated.View exiting={FadeOut.duration(150)} className="gap-3 px-4">
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn.duration(200)} className="gap-3">
              {catalogQuery.data?.map(channel => (
                <ChannelCard key={channel.id} channel={channel} mutations={mutations} />
              ))}
            </Animated.View>
          )}

          {/* Pairing requests */}
          {pairingRequests.length > 0 && (
            <View className="gap-3 px-4">
              <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Pending Pairing Requests
              </Text>
              <View className="rounded-lg bg-secondary overflow-hidden">
                {pairingRequests.map((request, index) => (
                  <View key={`${request.channel}-${request.code}`}>
                    {index > 0 && <View className="ml-4 h-px bg-border" />}
                    <View className="flex-row items-center gap-3 px-4 py-3">
                      <MessageSquare size={18} color={colors.foreground} />
                      <View className="flex-1 gap-0.5">
                        <Text className="text-sm font-medium">
                          {CHANNEL_LABELS[request.channel] ?? request.channel}
                        </Text>
                        <Text variant="muted" className="text-xs">
                          Code: {request.code}
                        </Text>
                      </View>
                      <Button
                        size="sm"
                        onPress={() => {
                          handleApprove(request.channel, request.code);
                        }}
                      >
                        <Text>Approve</Text>
                      </Button>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}
