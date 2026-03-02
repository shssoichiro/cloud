/**
 * Client-safe utility for determining available thinking effort variants per model.
 * Mirrors the variant keys from src/lib/providers/recommended-models.ts#getModelVariants
 * but returns only the variant names (not the SDK option objects) so it can be
 * imported from React components without pulling in server-only dependencies.
 */

const ANTHROPIC_VARIANTS = ['none', 'low', 'medium', 'high', 'max'] as const;
const OPENAI_VARIANTS = ['none', 'low', 'medium', 'high', 'xhigh'] as const;
const BINARY_VARIANTS = ['instant', 'thinking'] as const;

/** Returns the ordered list of thinking-effort variant names available for a model, or [] if the model has no variants. */
export function getAvailableThinkingEfforts(modelSlug: string): string[] {
  if (modelSlug.startsWith('anthropic/')) return [...ANTHROPIC_VARIANTS];
  if (modelSlug.startsWith('openai/') && !modelSlug.startsWith('openai/gpt-oss'))
    return [...OPENAI_VARIANTS];
  if (modelSlug.startsWith('google/gemini-3')) return [...OPENAI_VARIANTS];
  if (modelSlug.startsWith('moonshotai/')) return [...BINARY_VARIANTS];
  if (modelSlug.startsWith('z-ai/')) return [...BINARY_VARIANTS];
  return [];
}

/** Human-readable label for a variant name. */
export function thinkingEffortLabel(variant: string): string {
  return variant.charAt(0).toUpperCase() + variant.slice(1);
}
