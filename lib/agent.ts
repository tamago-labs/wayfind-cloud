// Browser client for the local computer agent server (Phase 1: localhost).
// Base URL comes from NEXT_PUBLIC_AGENT_URL (default http://localhost:8080).
// When we migrate to MicroVM, this same shape talks to the VM URL with a token.
'use client';

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL ?? 'http://localhost:8080';

export interface HistoryMessage {
  role: 'user' | 'assistant' | 'tool';
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

export async function postTask(
  text: string,
  conversationId?: string,
  system?: string,
  allowedSkills?: string[],
): Promise<string> {
  const res = await fetch(`${AGENT_URL}/task`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, conversationId, system, allowedSkills }),
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
          handlers.onApproval?.({
            approvalId: e.approvalId as string,
            permission: typeof e.permission === 'string' ? (e.permission as string) : undefined,
            target: typeof e.target === 'string' ? (e.target as string) : undefined,
          });
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

/** Compress a first message into a short role label. Returns '' on failure (caller keeps role empty). */
export async function summarizeRole(text: string): Promise<string> {
  try {
    const res = await fetch(`${AGENT_URL}/summarize-role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return '';
    const { role } = (await res.json()) as { role?: string };
    return typeof role === 'string' ? role.trim().slice(0, 80) : '';
  } catch {
    return '';
  }
}
export async function getHistory(conversationId: string): Promise<HistoryMessage[]> {
  const res = await fetch(`${AGENT_URL}/history/${conversationId}`);
  if (!res.ok) throw new Error(`agent /history → ${res.status}`);
  const { messages } = (await res.json()) as { messages: HistoryMessage[] };
  return messages;
}

/** Server status: workspace, permission mode, search key, provider. */
export async function getServerStatus(): Promise<{
  permissionMode: 'permissive' | 'enforcing';
  provider: { baseURL: string; model: string };
}> {
  const res = await fetch(`${AGENT_URL}/status`);
  if (!res.ok) throw new Error(`agent /status → ${res.status}`);
  return (await res.json()) as {
    permissionMode: 'permissive' | 'enforcing';
    provider: { baseURL: string; model: string };
  };
}

// ---- Settings (permissions + providers) ----

export interface PermissionRule {
  permission: string;
  pattern: string;
  action: 'allow' | 'ask' | 'deny';
}

export async function getPermissions(): Promise<{ rules: PermissionRule[]; canUndo: boolean }> {
  const res = await fetch(`${AGENT_URL}/permissions`);
  if (!res.ok) throw new Error(`agent /permissions → ${res.status}`);
  return (await res.json()) as { rules: PermissionRule[]; canUndo: boolean };
}

export async function setPermissions(rules: PermissionRule[]): Promise<PermissionRule[]> {
  const res = await fetch(`${AGENT_URL}/permissions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules }),
  });
  if (!res.ok) {
    const { error } = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(error ?? `agent /permissions → ${res.status}`);
  }
  const { rules: saved } = (await res.json()) as { rules: PermissionRule[] };
  return saved;
}

/** Restore permissions to before the last save. Returns null when nothing to undo. */
export async function undoPermissions(): Promise<{ rules: PermissionRule[]; canUndo: boolean } | null> {
  const res = await fetch(`${AGENT_URL}/permissions/undo`, { method: 'POST' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`agent /permissions/undo → ${res.status}`);
  return (await res.json()) as { rules: PermissionRule[]; canUndo: boolean };
}

export interface ProviderInfo {
  baseURL: string;
  keyConfigured: boolean;
  keystore: string;
  models: string[];
}

export interface ProvidersState {
  defaults: { provider?: string; model?: string } | null;
  providers: Record<string, ProviderInfo>;
}

export async function getProviders(): Promise<ProvidersState> {
  const res = await fetch(`${AGENT_URL}/providers`);
  if (!res.ok) throw new Error(`agent /providers → ${res.status}`);
  return (await res.json()) as ProvidersState;
}

export interface InstalledSkill {
  name: string;
  description: string;
  source: string;
  files: number;
}

/** Installed skill catalog for the Settings list + per-bot picker. */
export async function getSkills(): Promise<InstalledSkill[]> {
  const res = await fetch(`${AGENT_URL}/skills`);
  if (!res.ok) throw new Error(`agent /skills → ${res.status}`);
  return ((await res.json()) as { skills: InstalledSkill[] }).skills;
}

export type SkillResolveResult =
  | { preview: { name: string; description: string; source: string; files: string[] } }
  | { choices: string[]; hint: string };

/** Preview a chat-provided source without installing anything. */
export async function resolveSkill(source: string): Promise<SkillResolveResult> {
  const res = await fetch(`${AGENT_URL}/skills/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
  });
  const body = (await res.json()) as {
    preview?: { name: string; description: string; source: string; files: string[] };
    choices?: string[];
    hint?: string;
    error?: string;
  };
  if (!res.ok) throw new Error(body.error ?? `agent /skills/resolve → ${res.status}`);
  if (body.preview) return { preview: body.preview };
  return { choices: body.choices ?? [], hint: body.hint ?? '' };
}

/** Install a resolved source. Throws with the validation message on conflict. */
export async function installSkill(source: string, overwrite = false): Promise<InstalledSkill[]> {
  const res = await fetch(`${AGENT_URL}/skills/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, overwrite }),
  });
  const body = (await res.json()) as { skills?: InstalledSkill[]; error?: string };
  if (!res.ok) throw new Error(body.error ?? `agent /skills/install → ${res.status}`);
  return body.skills ?? [];
}

/** Remove an installed skill. Returns false when unknown. */
export async function removeSkill(name: string): Promise<boolean> {
  const res = await fetch(`${AGENT_URL}/skills/${encodeURIComponent(name)}`, { method: 'DELETE' });
  return res.ok;
}
