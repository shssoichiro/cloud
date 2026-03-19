'use client';

import { useState } from 'react';
import { ChevronRight, Send, Slack } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { DiscordIcon } from './icons/DiscordIcon';

type ChannelId = 'telegram' | 'discord' | 'slack';

type ChannelOption = {
  id: ChannelId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  effort: 1 | 2 | 3;
  effortColor: 'emerald' | 'amber';
  recommended?: boolean;
};

const CHANNEL_OPTIONS: ChannelOption[] = [
  {
    id: 'telegram',
    label: 'Telegram',
    icon: Send,
    description:
      'Chat with your bot directly in Telegram. Just open a conversation with it \u2014 no workspace, no admin access, ready in seconds.',
    effort: 1,
    effortColor: 'emerald',
    recommended: true,
  },
  {
    id: 'discord',
    label: 'Discord',
    icon: DiscordIcon,
    description:
      'Talk to your bot in a Discord server channel. Requires adding it as a bot to your server.',
    effort: 3,
    effortColor: 'amber',
  },
  {
    id: 'slack',
    label: 'Slack',
    icon: Slack,
    description:
      'Talk to your bot in a Slack channel. Requires installing it as an app in your workspace.',
    effort: 3,
    effortColor: 'amber',
  },
];

export function ChannelSelectionStep({
  onSelect,
  onSkip,
}: {
  onSelect: (channelId: ChannelId) => void;
  onSkip: () => void;
}) {
  return <ChannelSelectionStepView onSelect={onSelect} onSkip={onSkip} />;
}

/** Pure visual shell — extracted so Storybook can render it without wiring up mutations. */
export function ChannelSelectionStepView({
  onSelect,
  onSkip,
}: {
  onSelect?: (channelId: ChannelId) => void;
  onSkip?: () => void;
}) {
  const [selected, setSelected] = useState<ChannelId | null>(null);

  const telegram = CHANNEL_OPTIONS[0];
  const others = CHANNEL_OPTIONS.slice(1);

  return (
    <Card className="mt-6">
      <CardContent className="flex flex-col gap-6 p-6 sm:p-8">
        {/* Step indicator */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              Step 3 of 4
            </span>
            <div className="flex gap-1">
              <span className="h-1.5 w-6 rounded-full bg-blue-500" />
              <span className="h-1.5 w-6 rounded-full bg-blue-500" />
              <span className="h-1.5 w-6 rounded-full bg-blue-500" />
              <span className="bg-muted h-1.5 w-6 rounded-full" />
            </div>
          </div>
          <h2 className="text-foreground text-2xl font-bold">Where do you want to chat?</h2>
          <p className="text-muted-foreground text-sm">
            Pick where you&apos;d like to talk to your KiloClaw bot. You can add more channels any
            time from settings.
          </p>
        </div>

        {/* Telegram — full width */}
        {telegram && (
          <ChannelCard
            option={telegram}
            isSelected={selected === telegram.id}
            onSelect={() => setSelected(telegram.id)}
          />
        )}

        {/* Discord + Slack — side by side */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {others.map(option => (
            <ChannelCard
              key={option.id}
              option={option}
              isSelected={selected === option.id}
              onSelect={() => setSelected(option.id)}
            />
          ))}
        </div>

        {/* Continue button */}
        <Button
          className="w-full bg-emerald-600 py-6 text-base text-white hover:bg-emerald-700"
          disabled={selected === null}
          onClick={() => selected && onSelect?.(selected)}
        >
          Continue
          <ChevronRight className="ml-1 h-5 w-5" />
        </Button>

        {/* Skip link */}
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground mx-auto text-sm transition-colors"
          onClick={() => onSkip?.()}
        >
          Skip for now
        </button>
      </CardContent>
    </Card>
  );
}

function ChannelCard({
  option,
  isSelected,
  onSelect,
}: {
  option: ChannelOption;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const Icon = option.icon;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex cursor-pointer flex-col gap-4 rounded-xl border p-5 text-left transition-colors',
        isSelected
          ? 'border-emerald-600 bg-emerald-950/20'
          : 'border-border hover:border-muted-foreground/40'
      )}
    >
      {/* Top row: icon + title + badge + radio */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-muted/50 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
            <Icon className="h-5 w-5 text-blue-400" />
          </div>
          <span className="text-sm font-bold">{option.label}</span>
          {option.recommended && (
            <span className="rounded-full border border-emerald-700 px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-emerald-400 uppercase">
              Recommended
            </span>
          )}
        </div>
        <RadioIndicator checked={isSelected} />
      </div>

      {/* Description */}
      <p className="text-muted-foreground text-xs leading-relaxed">{option.description}</p>

      {/* Effort indicator */}
      <EffortIndicator level={option.effort} color={option.effortColor} />
    </button>
  );
}

function RadioIndicator({ checked }: { checked: boolean }) {
  return (
    <div
      className={cn(
        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        checked ? 'border-emerald-500' : 'border-muted-foreground/40'
      )}
    >
      {checked && <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />}
    </div>
  );
}

function EffortIndicator({ level, color }: { level: 1 | 2 | 3; color: 'emerald' | 'amber' }) {
  const filledClass = color === 'emerald' ? 'bg-emerald-500' : 'bg-amber-500';

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs">Effort</span>
      <div className="flex gap-1">
        {[1, 2, 3].map(i => (
          <span
            key={i}
            className={cn('h-2 w-4 rounded-full', i <= level ? filledClass : 'bg-muted')}
          />
        ))}
      </div>
    </div>
  );
}
