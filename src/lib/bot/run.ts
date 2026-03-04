import {
  BOT_SYSTEM_PROMPT,
  BOT_USER_AGENT,
  BOT_VERSION,
  DEFAULT_BOT_MODEL,
} from '@/lib/bot/constants';
import { MAX_ITERATIONS } from '@/lib/bot/constants';
import { APP_URL } from '@/lib/constants';
import { FEATURE_HEADER } from '@/lib/feature-detection';
import { generateApiToken } from '@/lib/tokens';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { PlatformIntegration, User } from '@kilocode/db';
import { ToolLoopAgent, stepCountIs } from 'ai';
import type { Thread, Message } from 'chat';

export async function processMessage({
  thread,
  message,
  platformIntegration,
  user,
}: {
  thread: Thread;
  message: Message;
  platformIntegration: PlatformIntegration;
  user: User;
}) {
  const headers: Record<string, string> = {
    'X-KiloCode-Version': BOT_VERSION,
    'User-Agent': BOT_USER_AGENT,
    [FEATURE_HEADER]: 'bot',
  };

  if (platformIntegration.owned_by_organization_id) {
    headers['X-KiloCode-OrganizationId'] = platformIntegration.owned_by_organization_id;
  }

  const provider = createOpenAICompatible({
    name: 'kilo-proxy',
    baseURL: `${APP_URL}/api/openrouter`,
    apiKey: generateApiToken(user, { internalApiUse: true }),
    headers,
  });

  const agent = new ToolLoopAgent({
    model: provider.chatModel(
      (platformIntegration.metadata as { model_slug?: string }).model_slug ?? DEFAULT_BOT_MODEL
    ),
    instructions: BOT_SYSTEM_PROMPT,
    stopWhen: stepCountIs(MAX_ITERATIONS),
  });

  try {
    const result = await agent.generate({ prompt: message.text });

    await thread.post(result.text);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);

    console.error(`[KiloBot] Error during bot run:`, errMsg, error);

    await thread.post(`Sorry, there was an error calling the AI service: ${errMsg.slice(0, 200)}`);
  }
}
