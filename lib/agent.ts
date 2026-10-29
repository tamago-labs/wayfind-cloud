// Browser client for the local computer agent server (Phase 1: localhost).
// Base URL comes from NEXT_PUBLIC_AGENT_URL (default http://localhost:8080).
// When we migrate to MicroVM, this same shape talks to the VM URL with a token.
'use client';

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL ?? 'http://localhost:8080';

export interface HistoryMessage {
  role: 'user' | 'assistant';
  text: string;
  at: string;
}

/** Resolve a parked approval. The run resumes and streams on. */
export async function decideApproval(approvalId: string, decision: 'approve' | 'reject'): Promise<boolean> {
  const res = await fetch(`${AGENT_URL}/approvals/${approvalId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision }),
  });
  return res.ok;
}

export async function postTask(text: string, conversationId?: string, system?: string): Promise<string> {
  const res = await fetch(`${AGENT_URL}/task`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, conversationId, system }),
  });
  if (!res.ok) throw new Error(`agent /task → ${res.status}`);
  const { runId } = (await res.json()) as { runId: string };
  return runId;
}

export interface StreamHandlers {
  onChunk?: (delta: string) => void;
  onAgent?: (name: string) => void;
  onApproval?: (approval: { approvalId: string; permission?: string; target?: string }) => void;
  onQuestion?: (q: {
    qid: string;
    questions: Array<{ question: string; header?: string; options: Array<{ label: string; description?: string }> }>;
  }) => void;
}

/** Resolve when the run emits done; reject on error/timeout. Ignores `: ping` heartbeats. */
export async function streamRun(runId: string, handlers: StreamHandlers, timeoutMs = 600_000): Promise<string> {
  const res = await fetch(`${AGENT_URL}/stream/${runId}`, { headers: { Accept: 'text/event-stream' } });
  if (!res.ok || !res.body) throw new Error(`agent /stream → ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let output = '';
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (Date.now() > deadline) {
      await reader.cancel().catch(() => {});
      throw new Error('agent run timed out');
    }
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';
    for (const part of parts) {
      for (const line of part.split('\n')) {
        const m = line.match(/^data: (.*)$/);
        if (!m) continue; // heartbeat comments etc.
        let e: { type: string; chunk?: string; agent?: string; output?: string; error?: string } & Record<
          string,
          unknown
        >;
        try {
          e = JSON.parse(m[1]);
        } catch {
          continue;
        }
        if (e.type === 'chunk' && typeof e.chunk === 'string') {
          output += e.chunk;
          handlers.onChunk?.(e.chunk);
        } else if (e.type === 'agent' && typeof e.agent === 'string') {
          handlers.onAgent?.(e.agent);
        } else if (e.type === 'approval' && typeof e.approvalId === 'string') {
          handlers.onApproval?.({ approvalId: e.approvalId as string });
        } else if (e.type === 'question' && typeof e.qid === 'string' && Array.isArray(e.questions)) {
          handlers.onQuestion?.({
            qid: e.qid as string,
            questions: e.questions as {
              question: string;
              header?: string;
              options: Array<{ label: string; description?: string }>;
            }[],
          });
        } else if (e.type === 'done') {
          if (typeof e.output === 'string') output = e.output;
          await reader.cancel().catch(() => {});
          return output;
        } else if (e.type === 'error') {
          await reader.cancel().catch(() => {});
          throw new Error(typeof e.error === 'string' ? e.error : 'agent run failed');
        }
      }
    }
  }
  await reader.cancel().catch(() => {});
  throw new Error('agent stream closed before done');
}

/** Answer a parked question. The run continues with your answers. */
export async function answerQuestion(qid: string, answers: string[][]): Promise<boolean> {
  const res = await fetch(`${AGENT_URL}/questions/${qid}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  });
  return res.ok;
}

export async function getHistory(conversationId: string): Promise<HistoryMessage[]> {
  const res = await fetch(`${AGENT_URL}/history/${conversationId}`);
  if (!res.ok) throw new Error(`agent /history → ${res.status}`);
  const { messages } = (await res.json()) as { messages: HistoryMessage[] };
  return messages;
}
