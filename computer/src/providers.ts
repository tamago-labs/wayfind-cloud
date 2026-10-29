// Provider catalog (cherry-lite): workspace/providers.json lists providers
// (baseURL, key source, per-model limits + cost/1M tokens). Resolution
// order per provider: env key → keystore key (arrays rotate). Models are
// resolved to SDK Model objects via OpenAIProvider — true per-agent
// providers with no global-client race.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OpenAIProvider } from '@openai/agents-openai';
import { WORKSPACE_DIR } from './config.js';
import { drawKey } from './keystore.js';

export interface ModelCost {
  input: number;
  output: number;
}

export interface CatalogModel {
  context?: number;
  cost?: ModelCost;
}

export interface CatalogProvider {
  baseURL: string;
  key?: { env?: string; keystore?: string };
  models?: Record<string, CatalogModel>;
}

export interface Catalog {
  defaults?: { provider?: string; model?: string };
  small?: { provider?: string; model?: string };
  providers?: Record<string, CatalogProvider>;
}

export function loadCatalog(): Catalog {
  const path = join(WORKSPACE_DIR, 'providers.json');
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Catalog;
  } catch {
    console.error('providers.json is not valid JSON — ignoring');
    return {};
  }
}

export function resolveApiKey(p: CatalogProvider): string {
  if (p.key?.env) {
    const v = process.env[p.key.env];
    if (v) return v;
  }
  const storeName = p.key?.keystore ?? 'PROVIDER_API_KEY';
  const v = drawKey(storeName) ?? process.env.PROVIDER_API_KEY ?? '';
  return v;
}

const providerCache = new Map<string, OpenAIProvider>();

function providerClient(id: string, p: CatalogProvider): OpenAIProvider {
  let client = providerCache.get(id);
  if (!client) {
    client = new OpenAIProvider({ apiKey: resolveApiKey(p) || 'missing-key', baseURL: p.baseURL });
    providerCache.set(id, client);
  }
  return client;
}

export interface ResolvedModel {
  providerId: string;
  modelId: string;
  // SDK Model object (getModel is async) — awaited by callers.
  get(): Promise<unknown>;
  cost?: ModelCost;
  context?: number;
}

export function resolveModel(providerId?: string, modelId?: string): ResolvedModel {
  const catalog = loadCatalog();
  const pid = providerId ?? catalog.defaults?.provider ?? 'default';
  const mid = modelId ?? catalog.defaults?.model ?? process.env.PROVIDER_MODEL ?? 'LongCat-2.0';
  const entry = catalog.providers?.[pid];
  const baseURL = entry?.baseURL ?? process.env.PROVIDER_BASE_URL ?? 'https://api.longcat.ai/openai/v1';
  const client = providerClient(pid, entry ?? { baseURL });
  const meta = entry?.models?.[mid];
  return {
    providerId: pid,
    modelId: mid,
    get: () => client.getModel(mid),
    cost: meta?.cost,
    context: meta?.context,
  };
}

export function resolveSmallModel(): ResolvedModel {
  const catalog = loadCatalog();
  return resolveModel(catalog.small?.provider, catalog.small?.model);
}
