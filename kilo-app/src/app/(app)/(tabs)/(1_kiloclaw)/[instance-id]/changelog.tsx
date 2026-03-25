import { ScrollView, View } from 'react-native';

import { ChangelogList } from '@/components/kiloclaw/changelog-list';
import { ScreenHeader } from '@/components/screen-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useKiloClawChangelog } from '@/lib/hooks/use-kiloclaw';

export default function ChangelogScreen() {
  const { data: entries, isPending } = useKiloClawChangelog();

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="What's New" />
      <ScrollView contentContainerClassName="px-4 py-4 gap-4" showsVerticalScrollIndicator={false}>
        <View className="gap-3">
          <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Recent Updates
          </Text>
          {isPending || !entries ? (
            <View className="gap-3">
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
            </View>
          ) : (
            <ChangelogList entries={entries} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}
