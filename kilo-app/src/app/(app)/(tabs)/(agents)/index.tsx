import { Bot } from 'lucide-react-native';
import { View } from 'react-native';

import { EmptyState } from '@/components/empty-state';

export default function AgentSessionList() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <EmptyState
        icon={Bot}
        title="No sessions yet"
        description="Your agent sessions will appear here"
      />
    </View>
  );
}
