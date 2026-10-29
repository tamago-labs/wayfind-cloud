// Run manager: background runs with chat-further SSE shapes
// ({chunk}/{agent}/{approval}/{done}), JSONL transcript, usage metering,
// approvals (permissive auto-allow in v1; enforcing parks), and child runs
// for `task` fan-out. Guard context
// isolates concurrent runs; interactive=false (server) parks asks until
// POST /approvals/:id decides.
import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { run } from '@openai/agents';
import { PROVIDER_MODEL, WORKSPACE_DIR } from '../core/config.js';
import { createTriageAgent, type AgentSelection } from '../agent/agent.js';
import { clearRunLog, runWithContext, toolCallCount, type ApprovalRequest, type GuardOpts } from '../core/guard.js';
import { resolveModel, resolveSmallModel } from '../providers/providers.js';
import { reportUsage } from './usage.js';

export interface RunEvent {
  type: 'chunk' | 'agent' | 'approval' | 'approval-resolved' | 'done' | 'error';
  chunk?: string;
  agent?: string;
  approvalId?: string;
  permission?: string;
  target?: string;
  auto?: boolean;
  decision?: 'approve' | 'reject';
  output?: string;
  error?: string;
  toolCalls?: number;
}

export interface Run {
  id: string;
  parentId?: string;
  model: string;
  provider: string;
  events: RunEvent[];
  done: boolean;
  output: string;
  toolCalls: number;
  startedAt: string;
}

export interface PendingApproval extends ApprovalRequest {
  runId: string;
  requestedAt: string;
}

const runs = new Map<string, Run>();
const pendingApprovals = new Map<string, { approval: PendingApproval; resolve: (d: 'approve' | 'reject') => void }>();

/** Fan-out cap: max concurrent child runs (task tool). Extras queue. */
const MAX_CHILD_RUNS = Number(process.env.MAX_CHILD_RUNS ?? 4);
let activeChildren = 0;
const childQueue: Array<() => void> = [];

function acquireChildSlot(): Promise<() => void> {
  if (activeChildren < MAX_CHILD_RUNS) {
    activeChildren += 1;
    return Promise.resolve(releaseChildSlot);
  }
  return new Promise((resolve) => {
    childQueue.push(() => {
      activeChildren += 1;
      resolve(releaseChildSlot);
    });
  });
}

function releaseChildSlot(): void {
  activeChildren -= 1;
  childQueue.shift()?.();
}

const convoPath = () => join(WORKSPACE_DIR, 'conversations.jsonl');

function appendTranscript(runId: string, role: string, text: string, parentId?: string): void {
  mkdirSync(WORKSPACE_DIR, { recursive: true });
  appendFileSync(
    convoPath(),
    JSON.stringify({ runId, parentId, role, text, at: new Date().toISOString() }) + '\n',
  );
}

function loadHistory(limit = 20): unknown[] {
  if (!existsSync(convoPath())) return [];
  const lines = readFileSync(convoPath(), 'utf8').trim().split('\n').filter(Boolean);
  return lines
    .slice(-limit)
    .map((l) => {
      try {
        return JSON.parse(l) as { role: string; text: string };
      } catch {
        return null;
      }
    })
    .filter((m): m is { role: string; text: string } => !!m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({
      type: 'message',
      role: m.role,
      content: [{ type: m.role === 'user' ? 'input_text' : 'output_text', text: m.text }],
    }));
}

function userMessage(text: string): unknown {
  return { type: 'message', role: 'user', content: [{ type: 'input_text', text }] };
}

export function getRun(id: string): Run | undefined {
  return runs.get(id);
}

export function listRuns(): Run[] {
  return [...runs.values()].slice(-20);
}

export function listPendingApprovals(): PendingApproval[] {
  return [...pendingApprovals.values()].map((p) => p.approval);
}

export function resolveApproval(id: string, decision: 'approve' | 'reject'): boolean {
  const pending = pendingApprovals.get(id);
  if (!pending) return false;
  pendingApprovals.delete(id);
  pending.resolve(decision);
  const r = runs.get(pending.approval.runId);
  r?.events.push({ type: 'approval-resolved', approvalId: id, decision });
  return true;
}

export interface StartRunOpts {
  interactive: boolean;
  provider?: string;
  model?: string;
  parentId?: string;
  /** Nesting depth of `task` delegation; top-level runs are 0. */
  depth?: number;
  onApproval?: (approval: PendingApproval) => void;
  approvalTimeoutMs?: number;
}

/** Max `task` delegation depth. At the cap the tool stays visible but asks
 * the model to do the work inline instead of spawning (no missing-tool confusion). */
const MAX_TASK_DEPTH = 4;

const APPROVAL_TIMEOUT_MS = Number(process.env.APPROVAL_TIMEOUT_MS ?? 10 * 60_000);

function wireGuard(runId: string, opts: StartRunOpts): GuardOpts {
  return {
    interactive: opts.interactive,
    onApproval: (a) => {
      runs.get(runId)?.events.push({
        type: 'approval',
        approvalId: a.id,
        permission: a.permission,
        target: a.target,
        auto: a.auto ?? false,
      });
      opts.onApproval?.({ ...a, runId, requestedAt: new Date().toISOString() });
    },
    waitForDecision: opts.interactive
      ? undefined
      : (a) =>
          new Promise<'approve' | 'reject'>((resolve) => {
            const timer = setTimeout(() => {
              if (pendingApprovals.delete(a.id)) resolve('reject');
            }, opts.approvalTimeoutMs ?? APPROVAL_TIMEOUT_MS);
            timer.unref?.();
            pendingApprovals.set(a.id, {
              approval: { ...a, runId, requestedAt: new Date().toISOString() },
              resolve: (d) => {
                clearTimeout(timer);
                resolve(d);
              },
            });
          }),
  };
}

async function executeRun(runState: Run, text: string, opts: StartRunOpts): Promise<string> {
  const startedAt = Date.now();
  const guardOpts = wireGuard(runState.id, opts);
  const depth = opts.depth ?? 0;
  try {
    const runChild = async (childText: string): Promise<string> => {
      if (depth + 1 >= MAX_TASK_DEPTH) {
        if (process.env.WAYFIND_DEBUG_EVENTS === '1') console.log(`[task] depth cap (${MAX_TASK_DEPTH}) — inline`);
        return '<task_result>\nDepth cap reached — do this part yourself instead of delegating.\n</task_result>';
      }
      return runToCompletion(childText, { ...opts, parentId: runState.id, depth: depth + 1 });
    };
    const agent = await createTriageAgent(guardOpts, { provider: opts.provider, model: opts.model }, runChild);
    // History isolation: children get ONLY their prompt. Inheriting the shared
    // transcript made descendants obey the parent's delegation instructions
    // (exponential spawn + semaphore deadlock). Top-level runs keep history.
    const input = (runState.parentId
      ? [userMessage(text)]
      : [...loadHistory(), userMessage(text)]) as never;
    const stream = await runWithContext(runState.id, () => run(agent, input, { stream: true, maxTurns: 20 }));
    const seenTypes = process.env.WAYFIND_DEBUG_EVENTS === '1' ? new Set<string>() : null;
    for await (const event of stream as unknown as Iterable<{
      type: string;
      agent?: { name: string };
      data?: { type: string; delta?: string };
      response?: { usage?: unknown };
    }>) {
      seenTypes?.add(event.type);
      if (event.type === 'raw_model_stream_event' && event.data?.type === 'output_text_delta' && event.data.delta) {
        runState.events.push({ type: 'chunk', chunk: event.data.delta });
      }
      if (event.type === 'agent_updated_stream_event' && event.agent) {
        runState.events.push({ type: 'agent', agent: event.agent.name });
      }
    }
    const output = (stream as unknown as { finalOutput?: unknown }).finalOutput;
    const textOut = typeof output === 'string' ? output : JSON.stringify(output ?? '');
    runState.output = textOut;
    runState.toolCalls = toolCallCount(runState.id);
    runState.events.push({ type: 'done', output: textOut, toolCalls: runState.toolCalls });
    appendTranscript(runState.id, 'assistant', textOut, runState.parentId);
    if (seenTypes) console.log(`[debug] stream event types: ${[...seenTypes].join(', ')}`);
    await reportUsage({
      runId: runState.id,
      model: runState.model,
      provider: runState.provider,
      durationMs: Date.now() - startedAt,
      outputChars: textOut.length,
      toolCalls: runState.toolCalls,
      costPer1M: resolveModel(opts.provider, opts.model).cost,
      at: new Date().toISOString(),
    });
    return textOut;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runState.events.push({ type: 'error', error: msg });
    appendTranscript(runState.id, 'system', `error: ${msg}`, runState.parentId);
    throw err instanceof Error ? err : new Error(msg);
  } finally {
    runState.done = true;
    clearRunLog(runState.id);
  }
}

export async function startRun(text: string, opts: StartRunOpts): Promise<Run> {
  await compactIfNeeded(opts);
  const runState: Run = {
    id: randomUUID(),
    parentId: opts.parentId,
    model: opts.model ?? PROVIDER_MODEL,
    provider: opts.provider ?? 'default',
    events: [],
    done: false,
    output: '',
    toolCalls: 0,
    startedAt: new Date().toISOString(),
  };
  runs.set(runState.id, runState);
  appendTranscript(runState.id, 'user', text, runState.parentId);
  void executeRun(runState, text, opts).catch(() => {});
  return runState;
}

/** Blocking child run for the `task` tool — returns the final output. */
export async function runToCompletion(text: string, opts: StartRunOpts): Promise<string> {
  const release = await acquireChildSlot();
  try {
    const runState: Run = {
      id: randomUUID(),
      parentId: opts.parentId,
      model: opts.model ?? PROVIDER_MODEL,
      provider: opts.provider ?? 'default',
      events: [],
      done: false,
      output: '',
      toolCalls: 0,
      startedAt: new Date().toISOString(),
    };
    runs.set(runState.id, runState);
    appendTranscript(runState.id, 'user', text, runState.parentId);
    return await executeRun(runState, text, opts);
  } finally {
    release();
  }
}

/** Summarize-then-trim the transcript when it grows past budget. */
const COMPACT_AT_CHARS = Number(process.env.COMPACT_AT_CHARS ?? 60_000);

async function compactIfNeeded(opts: StartRunOpts): Promise<void> {
  let raw: string;
  try {
    raw = readFileSync(convoPath(), 'utf8');
  } catch {
    return;
  }
  if (raw.length < COMPACT_AT_CHARS) return;
  const lines = raw.trim().split('\n');
  const keep = Math.max(10, Math.floor(lines.length * 0.3));
  const old = lines.slice(0, lines.length - keep).join('\n');
  const small = resolveSmallModel();
  const summary = await runToCompletion(
    `Summarize this agent transcript in 10 bullet lines or fewer. Keep: user goals, key findings, files changed, pending work. Transcript:\n${old.slice(0, 30_000)}`,
    { ...opts, provider: small.providerId, model: small.modelId, parentId: undefined },
  );
  const kept = lines.slice(lines.length - keep);
  writeFileSync(
    convoPath(),
    JSON.stringify({ runId: 'compaction', role: 'system', text: `Summary of earlier work:\n${summary}`, at: new Date().toISOString() }) +
      '\n' +
      kept.join('\n') +
      '\n',
  );
  console.log(`[compact] transcript ${raw.length} → summary + ${keep} recent lines`);
}
