import type { GatewayRequest } from '@/lib/providers/openrouter/types';

export function getMaxTokens(request: GatewayRequest) {
  return request.kind === 'chat_completions'
    ? (request.body.max_completion_tokens ?? request.body.max_tokens ?? null)
    : (request.body.max_output_tokens ?? null);
}
