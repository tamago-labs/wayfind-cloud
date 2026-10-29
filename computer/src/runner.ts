// Run manager: starts agent runs in the background, collects chat-further
// SSE event shapes ({chunk}/{agent}/{approval}/{done}), persists the
// transcript as JSONL, and reports usage. Guard context isolates concurrent
// runs; interactive=false (server) turns asks into approval events.
import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { run } from '@openai/agents';
import { PROVIDER_MODEL, WORKSPACE_DIR } from './config.js';
import { createTriageAgent } from './agent.js';
import { clearRunLog, runWithContext, toolCallCount, type GuardOpts } from './guard.js';
import { reportUsage } from './usage.js';

export interface RunEvent {
  type: 'chunk' | 'agent' | 'approval' | 'done' | 'error';
  chunk?: string;
  agent?: string;
  permission?: string;
  target?: string;
  output?: string;
  error?: string;
}

export interface Run {
  id: string;
  model: string;
  events: RunEvent[];
  done: boolean;
  output: string;
  toolCalls: number;
  startedAt: string;
}

const runs = new Map<string, Run>();
const convoPath = () => join(WORKSPACE_DIR, 'conversations.jsonl');

function appendTranscript(runId: string, role: string, text: string): void {
  mkdirSync(WORKSPACE_DIR, { recursive: true });
  appendFileSync(convoPath(), JSON.stringify({ runId, role, text, at: new Date().toISOString() }) + '\n');
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

export interface StartRunOpts {
  interactive: boolean;
  onApproval?: (permission: string, target: string) => void;
}

export async function startRun(text: string, opts: StartRunOpts): Promise<Run> {
  const id = randomUUID();
  const startedAt = Date.now();
  const guardOpts: GuardOpts = {
    interactive: opts.interactive,
    onApproval: (permission, target) => {
      const r = runs.get(id);
      r?.events.push({ type: 'approval', permission, target });
      opts.onApproval?.(permission, target);
    },
  };
  const runState: Run = {
    id,
    model: PROVIDER_MODEL,
    events: [],
    done: false,
    output: '',
    toolCalls: 0,
    startedAt: new Date(startedAt).toISOString(),
  };
  runs.set(id, runState);
  appendTranscript(id, 'user', text);

  void (async () => {
    try {
      const agent = await createTriageAgent(guardOpts);
      const input = [...loadHistory(), { role: 'user', content: text }] as never;
      const stream = await runWithContext(id, () =>
        run(agent, input, { stream: true, maxTurns: 20 }),
      );
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
      runState.toolCalls = toolCallCount(id);
      runState.events.push({ type: 'done', output: textOut });
      appendTranscript(id, 'assistant', textOut);
      await reportUsage({
        runId: id,
        model: PROVIDER_MODEL,
        durationMs: Date.now() - startedAt,
        outputChars: textOut.length,
        toolCalls: runState.toolCalls,
        at: new Date().toISOString(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      runState.events.push({ type: 'error', error: msg });
      appendTranscript(id, 'system', `error: ${msg}`);
    } finally {
      runState.done = true;
      clearRunLog(id);
    }
  })();

  return runState;
}
