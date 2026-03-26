import { getEnvVariable } from '@/lib/dotenvx';
import { applyByteDanceProviderSettings } from '@/lib/providers/bytedance';
import { applyCoreThinkProviderSettings } from '@/lib/providers/corethink';
import { applyAlibabaProviderSettings } from '@/lib/providers/qwen';
import type { Provider } from '@/lib/providers/types';
import { applyVercelSettings } from '@/lib/providers/vercel';

export default {
  OPENROUTER: {
    id: 'openrouter',
    apiUrl: 'https://openrouter.ai/api/v1',
    apiKey: getEnvVariable('OPENROUTER_API_KEY'),
    transformRequest() {},
  },
  ALIBABA: {
    id: 'alibaba',
    apiUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    apiKey: getEnvVariable('ALIBABA_API_KEY'),
    transformRequest(context) {
      applyAlibabaProviderSettings(context.request);
    },
  },
  BYTEDANCE: {
    id: 'bytedance',
    apiUrl: 'https://ark.ap-southeast.bytepluses.com/api/v3',
    apiKey: getEnvVariable('BYTEDANCE_API_KEY'),
    transformRequest(context) {
      applyByteDanceProviderSettings(context.request);
    },
  },
  CORETHINK: {
    id: 'corethink',
    apiUrl: 'https://api.corethink.ai/v1/code',
    apiKey: getEnvVariable('CORETHINK_API_KEY'),
    transformRequest(context) {
      applyCoreThinkProviderSettings(context.request);
    },
  },
  MARTIAN: {
    id: 'martian',
    apiUrl: 'https://api.withmartian.com/v1',
    apiKey: getEnvVariable('MARTIAN_API_KEY'),
    transformRequest() {},
  },
  MISTRAL: {
    id: 'mistral',
    apiUrl: 'https://api.mistral.ai/v1',
    apiKey: getEnvVariable('MISTRAL_API_KEY'),
    transformRequest() {},
  },
  MORPH: {
    id: 'morph',
    apiUrl: 'https://api.morphllm.com/v1',
    apiKey: getEnvVariable('MORPH_API_KEY'),
    transformRequest() {},
  },
  VERCEL_AI_GATEWAY: {
    id: 'vercel',
    apiUrl: 'https://ai-gateway.vercel.sh/v1',
    apiKey: getEnvVariable('VERCEL_AI_GATEWAY_API_KEY'),
    transformRequest(context) {
      applyVercelSettings(context.model, context.request, context.userByok);
    },
  },
} as const satisfies Record<string, Provider>;
