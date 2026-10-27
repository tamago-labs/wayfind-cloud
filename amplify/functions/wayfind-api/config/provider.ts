/**
 * Model router config (PRD §7). OpenAI-compatible providers only.
 * API keys arrive via Amplify secrets at runtime (Phase 4) — never literals.
 * - grok: xAI Grok API (https://api.x.ai/v1, Responses API) — reference provider
 * - cheap: affordable model for watchers / routine prep, escalation only
 */
export const PROVIDERS = {
  grok: {
    baseUrl: "https://api.x.ai/v1",
    model: "grok-4.7",
    secretName: "XAI_API_KEY",
  },
  cheap: {
    baseUrl: "https://api.longcat.ai/openai/v1",
    model: "LongCat-2.0",
    secretName: "LONGCAT_API_KEY",
  },
} as const;

export type ProviderName = keyof typeof PROVIDERS;

// Backwards-compatible exports for older imports
export const PROVIDER_BASE_URL = PROVIDERS.cheap.baseUrl;
export const PROVIDER_MODEL = PROVIDERS.cheap.model;
