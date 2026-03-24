import { Server } from 'lucide-react-native';
import { View } from 'react-native';

import { EmptyState } from '@/components/empty-state';

export default function KiloClawInstanceList() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <EmptyState
        icon={Server}
        title="No instances yet"
        description="Your KiloClaw instances will appear here"
      />
    </View>
  );
}
