// Run manager: background runs with chat-further SSE shapes
// ({chunk}/{agent}/{approval}/{done}), JSONL transcript, usage metering,
// pause/resume approvals, and child runs for `task` fan-out. Guard context
// isolates concurrent runs; interactive=false (server) parks asks until
// POST /approvals/:id decides.
import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { run } from '@openai/agents';
import { PROVIDER_MODEL, WORKSPACE_DIR } from './config.js';
import { createTriageAgent, type AgentSelection } from './agent.js';
import { clearRunLog, runWithContext, toolCallCount, type ApprovalRequest, type GuardOpts } from './guard.js';
import { resolveModel } from './providers.js';
import { reportUsage } from './usage.js';

export interface RunEvent {
  type: 'chunk' | 'agent' | 'approval' | 'approval-resolved' | 'done' | 'error';
  chunk?: string;
  agent?: string;
  approvalId?: string;
  permission?: string;
  target?: string;
  decision?: 'approve' | 'reject';
  output?: string;
  error?: string;
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

const convoPath = () => join(WORKSPACE_DIR, 'conversations.jsonl');

function appendTranscript(runId: string, role: string, text: string, parentId?: string): void {
  mkdirSync(WORKSPACE_DIR, { recursive: true });
  appendFileSync(
    convoPath(),
    JSON.stringify({ runId, parentId, role, text, at: new Date().toISOString() }) + '\n',
  );
}

function loadHistory(limit = 20): Array<{ role: 'user' | 'assistant'; content: string }> {
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
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text }));
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
  onApproval?: (approval: PendingApproval) => void;
  approvalTimeoutMs?: number;
}

const APPROVAL_TIMEOUT_MS = 10 * 60_000;

function wireGuard(runId: string, opts: StartRunOpts): GuardOpts {
  return {
    interactive: opts.interactive,
    onApproval: (a) => {
      runs.get(runId)?.events.push({
        type: 'approval',
        approvalId: a.id,
        permission: a.permission,
        target: a.target,
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
  try {
    const agent = await createTriageAgent(
      guardOpts,
      { provider: opts.provider, model: opts.model },
      (childText) => runToCompletion(childText, { ...opts, parentId: runState.id }),
    );
    const input = [...loadHistory(), { role: 'user', content: text }] as never;
    const stream = await runWithContext(runState.id, () => run(agent, input, { stream: true, maxTurns: 20 }));
    for await (const event of stream as unknown as Iterable<{
      type: string;
      agent?: { name: string };
      data?: { type: string; delta?: string };
    }>) {
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
    runState.events.push({ type: 'done', output: textOut });
    appendTranscript(runState.id, 'assistant', textOut, runState.parentId);
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
  return executeRun(runState, text, opts);
}
