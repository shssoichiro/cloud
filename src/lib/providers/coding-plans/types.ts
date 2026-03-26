import type { DirectUserByokInferenceProviderId } from '@/lib/providers/openrouter/inference-provider-id';
import type { CustomLlmExtraBody, CustomLlmProvider } from '@kilocode/db';

export type CodingPlanModel = {
  id: string;
  name: string;
  is_recommended: boolean;
  description: string;
  context_length: number;
  max_completion_tokens: number;
  extra_body: CustomLlmExtraBody;
};

export type CodingPlanProvider = {
  id: DirectUserByokInferenceProviderId;
  name: string;
  base_url: string;
  models: ReadonlyArray<CodingPlanModel>;
  ai_sdk_provider: CustomLlmProvider;
};
