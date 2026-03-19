import type { Meta, StoryObj } from '@storybook/nextjs';
import { ChannelSelectionStepView } from '@/app/(app)/claw/components/ChannelSelectionStep';

const meta: Meta<typeof ChannelSelectionStepView> = {
  title: 'Claw/ChannelSelectionStep',
  component: ChannelSelectionStepView,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <div className="mx-auto flex w-full max-w-[1140px] flex-col gap-6 p-4 md:p-6">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
