// Conversation context inspection + compaction.
//
// The SDK session per conversation is the model's working memory; its size
// is estimated like opencode (JSON chars / 4 — no tokenizer dependency).
// Limits come from workspace/providers.json per model. Compaction keeps a
// tail of recent turns verbatim and condenses the head through the catalog
// `small` model, then rebuilds the session as [summary, ...tail].
import type { AgentInputItem } from '@openai/agents';
import { loadCatalog, resolveApiKey, resolveSmallModel } from './providers/providers.js';
import { conversationSelection, dropSession, ensureSession, peekSession } from './runs/runner.js';

/** Token estimate heuristic (opencode's CHARS_PER_TOKEN). */
const CHARS_PER_TOKEN = 4;
/** Recent turns kept verbatim through a compaction. */
const TAIL_TOKENS = 8000;
/** Fallback limit when the catalog has no entry (1M-class models). */
const DEFAULT_LIMIT = 1_000_000;
/** Below this fraction of the limit, manual compact is a no-op. */
const COMPACT_MIN_FRACTION = 0.1;
/** Cap on head text sent to the summarizer (bounds cost + latency). */
const HEAD_CHAR_CAP = 100_000;

export interface ContextStats {
  tokens: number;
  limit: number;
  /** Percent of limit used, one decimal. */
  pct: number;
  model: string;
  provider: string;
  items: number;
}

function estimateTokens(items: unknown): number {
  return Math.ceil(JSON.stringify(items).length / CHARS_PER_TOKEN);
}

/** Resolve a model id to provider + context limit by scanning the catalog. */
function findModel(modelId?: string): { providerId: string; context: number } | undefined {
  if (!modelId) return undefined;
  const providers = loadCatalog().providers ?? {};
  for (const [pid, p] of Object.entries(providers)) {
    const meta = p.models?.[modelId];
    if (meta) return { providerId: pid, context: meta.context ?? DEFAULT_LIMIT };
  }
  return undefined;
}

function selectionFor(
  conversationId: string,
  modelOverride?: string,
): { providerId: string; modelId: string; context: number } {
  const catalog = loadCatalog();
  // Explicit model wins (the client knows the bot's pick).
  const found = findModel(modelOverride);
  if (found && modelOverride) return { ...found, modelId: modelOverride };
  // Else the conversation's last run selection.
  const last = conversationSelection(conversationId);
  if (last?.model) {
    const f = findModel(last.model);
    if (f) return { ...f, modelId: last.model };
    if (last.provider) {
      const ctx = catalog.providers?.[last.provider]?.models?.[last.model]?.context ?? DEFAULT_LIMIT;
      return { providerId: last.provider, modelId: last.model, context: ctx };
    }
  }
  // Else the catalog default.
  const dp = catalog.defaults?.provider ?? 'modal-glm';
  const dm = catalog.defaults?.model ?? 'zai-org/GLM-5.3-Flash';
  return {
    providerId: dp,
    modelId: dm,
    context: catalog.providers?.[dp]?.models?.[dm]?.context ?? DEFAULT_LIMIT,
  };
}

function statsFor(items: AgentInputItem[], sel: { providerId: string; modelId: string; context: number }): ContextStats {
  const tokens = estimateTokens(items);
  return {
    tokens,
    limit: sel.context,
    pct: sel.context > 0 ? Math.round((tokens / sel.context) * 1000) / 10 : 0,
    model: sel.modelId,
    provider: sel.providerId,
    items: items.length,
  };
}

async function sessionItems(conversationId: string): Promise<AgentInputItem[]> {
  const s = peekSession(conversationId);
  if (!s) return [];
  try {
    return await s.getItems();
  } catch {
    return [];
  }
}

/** Current context usage for a conversation. Unknown conversations read empty. */
export async function getContextStats(conversationId: string, modelOverride?: string): Promise<ContextStats> {
  const sel = selectionFor(conversationId, modelOverride);
  return statsFor(await sessionItems(conversationId), sel);
}

/** Drop a conversation's session. The next run starts fresh (context reset). */
export async function clearContext(conversationId: string): Promise<{ cleared: boolean }> {
  return { cleared: dropSession(conversationId) };
}

const SUMMARY_SYSTEM =
  'You summarize an AI assistant conversation so work can continue after context compaction. ' +
  'Keep: decisions made, key facts (names, file paths, URLs, IDs), open todos, user preferences, ' +
  'and where things stand. Be concise — a few short sections, no fluff.';

export interface CompactResult extends ContextStats {
  compacted: boolean;
  note: string;
}

/** Condense a conversation's head into a summary, keeping the tail verbatim.
 * Rebuilds the session as [summary, ...tail]. */
export async function compactContext(conversationId: string, modelOverride?: string): Promise<CompactResult> {
  const sel = selectionFor(conversationId, modelOverride);
  const items = await sessionItems(conversationId);
  const base = statsFor(items, sel);
  if (items.length === 0) return { ...base, compacted: false, note: 'context already empty' };
  if (base.tokens < sel.context * COMPACT_MIN_FRACTION) {
    return { ...base, compacted: false, note: 'context small — nothing to compact' };
  }
  // Tail: newest items within budget, kept verbatim.
  const budget = TAIL_TOKENS * CHARS_PER_TOKEN;
  const tail: AgentInputItem[] = [];
  let size = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    const len = JSON.stringify(items[i]).length;
    if (size + len > budget && tail.length > 0) break;
    tail.unshift(items[i]);
    size += len;
  }
  const head = items.slice(0, items.length - tail.length);
  if (head.length === 0) return { ...base, compacted: false, note: 'everything fits in the tail budget' };
  // Summarize the head through the catalog small model (plain chat call —
  // no agent loop, no tools, bounded input).
  const small = resolveSmallModel();
  const providers = loadCatalog().providers ?? {};
  const entry = providers[small.providerId];
  const baseURL = (entry?.baseURL ?? '').replace(/\/$/, '');
  const key = entry ? resolveApiKey(entry) : '';
  if (!baseURL || !key) throw new Error('small model not configured — cannot compact');
  const headText = JSON.stringify(head).slice(0, HEAD_CHAR_CAP);
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: small.modelId,
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM },
        { role: 'user', content: `Summarize this assistant conversation for continuation:\n\n${headText}` },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`summarizer → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: unknown };
  const summary = body.choices?.[0]?.message?.content?.trim();
  if (!summary) throw new Error('summarizer returned no content');
  const summaryItem = {
    role: 'user',
    content: `[Compacted context summary — earlier conversation condensed]\n\n${summary}`,
  } as unknown as AgentInputItem;
  const session = ensureSession(conversationId);
  await session.clearSession();
  await session.addItems([summaryItem, ...tail]);
  const fresh = await sessionItems(conversationId);
  return {
    ...statsFor(fresh, sel),
    compacted: true,
    note: `condensed ${head.length} items, kept ${tail.length} recent`,
  };
}
