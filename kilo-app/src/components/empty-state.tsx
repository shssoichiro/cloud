import { type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  className,
}: Readonly<EmptyStateProps>) {
  return (
    <View className={cn('items-center justify-center gap-4 px-6', className)}>
      <View className="items-center justify-center rounded-full bg-muted p-4">
        <Icon size={32} className="text-muted-foreground" />
      </View>
      <View className="items-center gap-1">
        <Text variant="large">{title}</Text>
        <Text variant="muted" className="text-center">
          {description}
        </Text>
      </View>
    </View>
  );
}
