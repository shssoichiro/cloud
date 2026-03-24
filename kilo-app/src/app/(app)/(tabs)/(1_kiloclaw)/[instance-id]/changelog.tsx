import { ScrollView, View } from 'react-native';

import { ChangelogList } from '@/components/kiloclaw/changelog-list';
import { Text } from '@/components/ui/text';
import { CHANGELOG_ENTRIES } from '@/lib/changelog-data';

export default function ChangelogScreen() {
  return (
    <ScrollView
      contentContainerClassName="px-4 py-4 gap-4"
      showsVerticalScrollIndicator={false}
    >
      <View className="gap-3">
        <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Recent Updates
        </Text>
        <ChangelogList entries={CHANGELOG_ENTRIES} />
      </View>
    </ScrollView>
  );
}
