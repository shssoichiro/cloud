import { Chat } from 'chat';
import { createSlackAdapter } from '@chat-adapter/slack';
import { createRedisState } from '@chat-adapter/state-redis';

const slackAdapter = createSlackAdapter({
  clientId: process.env.SLACK_CLIENT_ID,
  clientSecret: process.env.SLACK_CLIENT_SECRET,
});

export const bot = new Chat({
  userName: process.env.NODE_ENV === 'production' ? 'Kilo' : 'Henk Bot',
  adapters: {
    slack: slackAdapter,
  },
  state: createRedisState(),
});

// Respond when someone @mentions the bot, or talks in a DM
bot.onNewMention(async thread => {
  await thread.post('Hello!');
});
