import type { GatewayRequest } from '@/lib/providers/openrouter/types';

export function getMaxTokens(request: GatewayRequest) {
  if (request.kind === 'chat_completions') {
    return request.body.max_completion_tokens ?? request.body.max_tokens ?? null;
  }
  if (request.kind === 'messages') {
    return request.body.max_tokens ?? null;
  }
  return request.body.max_output_tokens ?? null;
}

export function hasMiddleOutTransform(request: GatewayRequest) {
  return (
    (request.kind === 'chat_completions' && request.body.transforms?.includes('middle-out')) ||
    false
  );
}
