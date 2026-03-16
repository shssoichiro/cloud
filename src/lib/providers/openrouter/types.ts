import type OpenAI from 'openai';
import type { GatewayProviderOptions } from '@ai-sdk/gateway';
import type { AnthropicProviderOptions } from '@ai-sdk/anthropic';
import type { ReasoningDetailUnion } from '@/lib/custom-llm/reasoning-details';
import type { AwsCredentials } from '@/lib/providers/openrouter/inference-provider-id';
import * as z from 'zod';

// Base types for OpenRouter API that don't depend on other lib files
// This breaks circular dependencies with mistral.ts, minimax.ts, etc.

export type OpenRouterProviderConfig = {
  order?: string[];
  only?: string[];
  ignore?: string[];
  data_collection?: 'allow' | 'deny';
  zdr?: boolean;
};

export type VercelInferenceProviderConfig = { apiKey: string; baseURL?: string } | AwsCredentials;

export type VercelProviderConfig = {
  gateway?: GatewayProviderOptions & {
    byok?: Record<string, VercelInferenceProviderConfig[]>;
  };
  anthropic?: AnthropicProviderOptions;
};

export function isFreePromptTrainingAllowed(provider: OpenRouterProviderConfig | undefined) {
  return provider?.data_collection !== 'deny' && !provider?.zdr;
}

export type OpenRouterReasoningConfig = {
  effort?: OpenAI.Chat.Completions.ChatCompletionReasoningEffort | 'none';
  max_tokens?: number;
  exclude?: boolean;
  enabled?: boolean;
};

type OpenCodeSpecificRequestProperties = {
  description?: string;
  usage?: { include: boolean };

  /**
   * @deprecated
   * Probably a typo, standard is reasoning_effort,
   * which is still not what we use which is reasoning: { effort }
   * */
  reasoningEffort?: string;
};

export type SharedGatewayRequestProperties = {
  // https://openrouter.ai/docs/features/provider-routing#requiring-providers-to-comply-with-data-policies
  provider?: OpenRouterProviderConfig;
  providerOptions?: VercelProviderConfig;

  // OpenRouter specific field we do not support
  // https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request#request.body.models
  models?: string[];

  thinking?: { type?: 'enabled' | 'disabled' };
};

export type GatewayResponsesRequest = SharedGatewayRequestProperties &
  OpenAI.Responses.ResponseCreateParams;

// Anthropic Messages API request type
// ref: https://docs.anthropic.com/en/api/messages
export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64' | 'url'; media_type?: string; data?: string; url?: string } }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content?: string | AnthropicContentBlock[] };

export type AnthropicMessage = {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
};

export type AnthropicTool = {
  name: string;
  description?: string;
  input_schema: { type: 'object'; properties?: Record<string, unknown>; required?: string[] };
};

export type GatewayMessagesRequest = SharedGatewayRequestProperties & {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string | { type: 'text'; text: string }[];
  stream?: boolean;
  tools?: AnthropicTool[];
  tool_choice?: { type: 'auto' | 'any' | 'tool'; name?: string };
  metadata?: { user_id?: string };
  stop_sequences?: string[];
  temperature?: number;
  top_p?: number;
  top_k?: number;
  // OpenRouter extra fields injected by the proxy
  safety_identifier?: string;
  prompt_cache_key?: string;
  user?: string;
};

/**
 * Approximately OpenRouter API request type. Actually based on OpenAI's, but the differences aren't huge.
 */
export type OpenRouterChatCompletionRequest = OpenAI.Chat.ChatCompletionCreateParams &
  OpenCodeSpecificRequestProperties &
  SharedGatewayRequestProperties & {
    max_tokens?: number;
    transforms?: string[];

    // https://openrouter.ai/docs/use-cases/reasoning-tokens#controlling-reasoning-tokens
    reasoning?: OpenRouterReasoningConfig;

    // https://platform.minimax.io/docs/api-reference/text-openai-api#4-important-note
    reasoning_split?: boolean;
  };

export type MessageWithReasoning = {
  reasoning?: string;
  reasoning_content?: string;
  reasoning_details?: ReasoningDetailUnion[];
};

export const GatewayApiKindSchema = z.enum([
  'chat_completions',
  'embeddings',
  'fim_completions',
  'messages',
  'responses',
]);


export type GatewayApiKind = z.infer<typeof GatewayApiKindSchema>;

export type GatewayRequest =
  | { kind: 'chat_completions'; body: OpenRouterChatCompletionRequest }
  | { kind: 'responses'; body: GatewayResponsesRequest }
  | { kind: 'messages'; body: GatewayMessagesRequest };

export type OpenRouterGeneration = {
  data: {
    id: string;
    is_byok?: boolean | null;
    total_cost: number;
    upstream_inference_cost?: number | null;
    created_at: string;
    model: string;
    origin: string;
    usage: number;
    upstream_id?: string | null;
    cache_discount?: number | null;
    app_id?: number | null;
    streamed?: boolean | null;
    cancelled?: boolean | null;
    provider_name?: string | null;
    latency?: number | null;
    moderation_latency?: number | null;
    generation_time?: number | null;
    finish_reason?: string | null;
    native_finish_reason?: string | null;
    tokens_prompt?: number | null;
    tokens_completion?: number | null;
    native_tokens_prompt?: number | null;
    native_tokens_completion?: number | null;
    native_tokens_reasoning?: number | null;
    native_tokens_cached?: number | null; //missing from docs
    num_media_prompt?: number | null;
    num_media_completion?: number | null;
    num_search_results?: number | null;
  };
};
