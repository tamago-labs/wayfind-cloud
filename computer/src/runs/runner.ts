// Run manager: background runs with chat-further SSE shapes
// ({chunk}/{agent}/{approval}/{done}), JSONL display transcript, usage
// metering, SDK-native approvals (interrupt/resume via RunState), sessions
// per conversation, and child runs for `task` fan-out.
//
// Approval model: tools declare `needsApproval` (see core/guard.ts
// approvalPolicy). When the model calls a gated tool in enforcing mode,
// the run pauses with `interruptions` — no blocked promises, no timers.
// POST /approvals/:id resumes via RunState. Permissive mode never
// interrupts (policy returns false) and auto-allows with an audit event.
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MemorySession, run, RunState } from '@openai/agents';
import { PROVIDER_MODEL, WORKSPACE_DIR } from '../core/config.js';
import { inside } from '../agent/tools/paths.js';
import { createTriageAgent, type AgentSelection } from '../agent/agent.js';
import type { QuestionPrompt } from '../agent/tools/question.js';
import type { BotRequest, BotRequestResult } from '../agent/tools/create_bot.js';
import type { MessageRunner, RosterEntry } from '../agent/tools/message_bot.js';
import type { ChildRequest, ChildResult } from '../agent/tools/task.js';
import { clearRunLog, grantForRun, runWithContext, toolCallCount, type GuardOpts } from '../core/guard.js';
import { check, loadRules, saveRules } from '../core/permissions.js';
import { resolveModel } from '../providers/providers.js';
import { reportUsage } from './usage.js';

export interface RunEvent {
  type: 'chunk' | 'agent' | 'approval' | 'approval-resolved' | 'question' | 'bot_request' | 'done' | 'error';
  chunk?: string;
  agent?: string;
  approvalId?: string;
  permission?: string;
  target?: string;
  auto?: boolean;
  decision?: 'approve' | 'reject';
  qid?: string;
  questions?: QuestionPrompt[];
  bid?: string;
  botName?: string;
  botRole?: string;
  botDescription?: string;
  output?: string;
  error?: string;
  toolCalls?: number;
}

export interface Run {
  id: string;
  parentId?: string;
  model: string;
  provider: string;
  /** Model/provider selection for agent rebuild on resume. */
  sel: AgentSelection;
  conversationId?: string;
  depth: number;
  events: RunEvent[];
  done: boolean;
  /** Paused on SDK interruptions, awaiting POST /approvals/:id. */
  parked: boolean;
  interruptions: PendingApproval[];
  /** Per-bot skill allowlist, mirrored from the start request so resume rebuilds the same agent. */
  allowedSkills?: string[];
  /** Chief-of-staff capability: create_bot tool + bot_request hook. Mirrored so resume rebuilds the same agent. */
  canManageBots?: boolean;
  /** Team roster for @mentions (chief thread). Mirrored so resume rebuilds the same agent. */
  roster?: RosterEntry[];
  /** This run's bot name — used for the [via …] tag on cross-bot messages. */
  botName?: string;
  stateJson?: string;
  output: string;
  toolCalls: number;
  startedAt: string;
}

export interface PendingApproval {
  id: string;
  runId: string;
  permission: string;
  target: string;
  requestedAt: string;
}

export interface PendingQuestion {
  id: string;
  runId: string;
  questions: QuestionPrompt[];
  requestedAt: string;
}

export interface PendingBotRequest {
  id: string;
  runId: string;
  request: BotRequest;
  requestedAt: string;
}

const pendingQuestions = new Map<
  string,
  { runId: string; questions: QuestionPrompt[]; requestedAt: string; resolve: (answers: string[][]) => void }
>();

export function listPendingQuestions(): PendingQuestion[] {
  return [...pendingQuestions.entries()].map(([id, p]) => ({
    id,
    runId: p.runId,
    questions: p.questions,
    requestedAt: p.requestedAt,
  }));
}

/** Resolve a parked question. Returns false for unknown ids. */
export function answerQuestion(id: string, answers: string[][]): boolean {
  const pending = pendingQuestions.get(id);
  if (!pending) return false;
  pendingQuestions.delete(id);
  pending.resolve(answers);
  return true;
}

const pendingBotRequests = new Map<
  string,
  { runId: string; request: BotRequest; requestedAt: string; resolve: (res: BotRequestResult) => void }
>();

export function listPendingBotRequests(): PendingBotRequest[] {
  return [...pendingBotRequests.entries()].map(([id, p]) => ({
    id,
    runId: p.runId,
    request: p.request,
    requestedAt: p.requestedAt,
  }));
}

/** Resolve a parked bot-creation request. Returns false for unknown ids. */
export function answerBotRequest(id: string, result: BotRequestResult): boolean {
  const pending = pendingBotRequests.get(id);
  if (!pending) return false;
  pendingBotRequests.delete(id);
  pending.resolve(result);
  return true;
}

/**
 * AskHook for the `question` tool: push an SSE event and wait for
 * POST /questions/:id. Times out to per-question [] after 120s
 * ("Unanswered" — opencode parity). NOTE: the provider turn stays open
 * while waiting; keep answers fast.
 */
function makeQuestionHook(runState: Run): (questions: QuestionPrompt[]) => Promise<string[][]> {
  return (questions: QuestionPrompt[]) => {
    const id = randomUUID();
    runState.events.push({ type: 'question', qid: id, questions });
    return new Promise<string[][]>((resolve) => {
      const timer = setTimeout(() => {
        if (pendingQuestions.delete(id)) resolve(questions.map(() => []));
      }, 120_000);
      timer.unref?.();
      pendingQuestions.set(id, {
        runId: runState.id,
        questions,
        requestedAt: new Date().toISOString(),
        resolve: (answers) => {
          clearTimeout(timer);
          resolve(answers);
        },
      });
    });
  };
}

/**
 * BotRequestHook for the `create_bot` tool: push an SSE event and wait for
 * POST /bot-requests/:id. Times out to cancelled after 120s (same as
 * questions — the provider turn stays open while waiting).
 */
function makeBotRequestHook(runState: Run): (req: BotRequest) => Promise<BotRequestResult> {
  return (req: BotRequest) => {
    const id = randomUUID();
    runState.events.push({ type: 'bot_request', bid: id, botName: req.name, botRole: req.role, botDescription: req.description });
    return new Promise<BotRequestResult>((resolve) => {
      const timer = setTimeout(() => {
        if (pendingBotRequests.delete(id)) resolve({ decision: 'cancel' });
      }, 120_000);
      timer.unref?.();
      pendingBotRequests.set(id, {
        runId: runState.id,
        request: req,
        requestedAt: new Date().toISOString(),
        resolve: (res) => {
          clearTimeout(timer);
          resolve(res);
        },
      });
    });
  };
}

const runs = new Map<string, Run>();

/** One SDK session per conversation — the model's working memory.
 * The JSONL transcript stays as the human-readable display log. */
const sessions = new Map<string, MemorySession>();
/** Conversations already seeded into their session from JSONL. */
const seeded = new Set<string>();

function sessionFor(conversationId: string | undefined): MemorySession | undefined {
  if (!conversationId) return undefined;
  let s = sessions.get(conversationId);
  if (!s) {
    s = new MemorySession();
    sessions.set(conversationId, s);
  }
  return s;
}

const convoPath = () => join(WORKSPACE_DIR, 'conversations.jsonl');

function appendTranscript(
  runId: string,
  role: string,
  text: string,
  parentId?: string,
  conversationId?: string,
): void {
  mkdirSync(WORKSPACE_DIR, { recursive: true });
  appendFileSync(
    convoPath(),
    JSON.stringify({ runId, parentId, conversationId, role, text, at: new Date().toISOString() }) + '\n',
  );
}

interface HistoryLine {
  role: string;
  text: string;
  at: string;
}

/** Transcript lines for one conversation (user/assistant/tool only).
 * Child runs (parentId set) are internal — their oriented prompts and raw
 * outputs stay in the raw JSONL for audit but never render as chat. */
export function getHistory(conversationId: string): HistoryLine[] {
  let raw: string;
  try {
    raw = readFileSync(convoPath(), 'utf8');
  } catch {
    return [];
  }
  const out: HistoryLine[] = [];
  for (const line of raw.trim().split('\n')) {
    if (!line) continue;
    try {
      const m = JSON.parse(line) as {
        role?: string;
        text?: string;
        at?: string;
        conversationId?: string;
        parentId?: string;
      };
      if (m.conversationId !== conversationId) continue;
      if (m.parentId !== undefined) continue; // child run — internal
      if ((m.role === 'user' || m.role === 'assistant' || m.role === 'tool') && typeof m.text === 'string') {
        out.push({ role: m.role, text: m.text, at: m.at ?? '' });
      }
    } catch {
      // ignore malformed lines
    }
  }
  return out;
}

/** Seed a fresh session from the existing display transcript (upgrade path).
 * Tool-activity rows are display-only — never fed back as model input. */
function seedFor(conversationId: string | undefined): unknown[] {
  if (!conversationId || seeded.has(conversationId)) return [];
  seeded.add(conversationId);
  // Shape notes (verified against the SDK's own schema + converter):
  // - user: plain string content is accepted everywhere.
  // - assistant: MUST be an array of output parts AND carry status — the
  //   RunState serializer requires it and the Responses converter calls
  //   content.map on it. Anything else breaks parking (enforcing mode).
  return getHistory(conversationId)
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-20)
    .map((m) =>
      m.role === 'assistant'
        ? {
            type: 'message' as const,
            role: 'assistant' as const,
            status: 'completed' as const,
            content: [{ type: 'output_text' as const, text: m.text }],
          }
        : {
            type: 'message' as const,
            role: 'user' as const,
            content: m.text,
          },
    );
}

function userMessage(text: string, attachments?: string[]): unknown {
  const { parts, hint } = attachContent(attachments);
  return {
    type: 'message',
    role: 'user',
    content: [{ type: 'input_text', text: hint ? `${text}\n\n${hint}` : text }, ...parts],
  };
}

/** Max attached files inlined per message; each capped at 10MB. */
const MAX_ATTACH = 5;
const MAX_ATTACH_BYTES = 10 * 1024 * 1024;

const ATTACH_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/** Split attachments: images inline as input_image data URLs (the chat
 * model sees them); anything else becomes a hint so the model reaches
 * for the read_file tool instead. */
function attachContent(paths: string[] | undefined): { parts: unknown[]; hint: string } {
  const parts: unknown[] = [];
  const hints: string[] = [];
  for (const p of (paths ?? []).slice(0, MAX_ATTACH)) {
    let full: string;
    try {
      full = inside(p);
    } catch {
      hints.push(`${p} (not found in workspace)`);
      continue;
    }
    const st = statSync(full, { throwIfNoEntry: false });
    if (!st || st.isDirectory() || st.size > MAX_ATTACH_BYTES) {
      hints.push(`${p} (could not attach — missing or over 10MB)`);
      continue;
    }
    const ext = p.slice(p.lastIndexOf('.')).toLowerCase();
    const mime = ATTACH_MIME[ext];
    if (mime) {
      const b64 = readFileSync(full).toString('base64');
      // SDK field is `image` (data URL string) in this version — not
      // `image_url`. Wrong name passes through unconverted and the
      // endpoint rejects the message.
      parts.push({ type: 'input_image', image: `data:${mime};base64,${b64}` });
    } else {
      hints.push(`${p} (use read_file to read it)`);
    }
  }
  return { parts, hint: hints.length > 0 ? `[attached files: ${hints.join(', ')}]` : '' };
}

export function getRun(id: string): Run | undefined {
  return runs.get(id);
}

export function listRuns(): Run[] {
  return [...runs.values()].slice(-20);
}

export function listPendingApprovals(): PendingApproval[] {
  const out: PendingApproval[] = [];
  for (const r of runs.values()) {
    if (r.parked) out.push(...r.interruptions);
  }
  return out;
}

/** Summarize tool arguments for the approval card. */
function describeTarget(toolName: string, argsText: string): string {
  try {
    const args = JSON.parse(argsText) as Record<string, unknown>;
    const first =
      args.command ??
      args.path ??
      args.description ??
      args.name ??
      args.source ??
      (Array.isArray(args.sources)
        ? `${args.sources.length} skills (${String(args.sources[0])}${args.sources.length > 1 ? ', …' : ''})`
        : undefined) ??
      args.query ??
      args.target ??
      args.input ??
      argsText;
    const s = typeof first === 'string' ? first : JSON.stringify(first);
    return s.length > 160 ? s.slice(0, 160) + '…' : s;
  } catch {
    return argsText.length > 160 ? argsText.slice(0, 160) + '…' : argsText;
  }
}

export async function resolveApproval(id: string, decision: 'approve' | 'reject'): Promise<boolean> {
  const runState = [...runs.values()].find((r) => r.parked && r.interruptions.some((a) => a.id === id));
  if (!runState || !runState.stateJson) return false;
  const agent = await createTriageAgent(
    auditTo(runState.id, runState.allowedSkills),
    runState.sel,
    makeRunChild(runState),
    makeQuestionHook(runState),
    runState.canManageBots ? makeBotRequestHook(runState) : undefined,
    runState.canManageBots
      ? { send: makeMessageRunner(runState), roster: (runState.roster ?? []).filter((b) => b.id) }
      : undefined,
  );
  let state: Awaited<ReturnType<typeof RunState.fromString>>;
  try {
    state = await RunState.fromString(agent as never, runState.stateJson);
  } catch (err) {
    runState.events.push({
      type: 'error',
      error: `resume failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    runState.parked = false;
    runState.done = true;
    return true;
  }
  const live = state.getInterruptions();
  const item = live.find((i) => {
    const raw = i.rawItem as unknown as { callId?: string };
    return (raw.callId ?? '') === id;
  });
  if (!item) return false;
  if (decision === 'approve') state.approve(item);
  else state.reject(item);
  runState.events.push({ type: 'approval-resolved', approvalId: id, decision });
  const decided = runState.interruptions.find((a) => a.id === id);
  runState.interruptions = runState.interruptions.filter((a) => a.id !== id);
  // Per-run grant: approving once auto-passes the same permission+target
  // for the rest of this run — the user doesn't re-click every call.
  // Persistent grant: an approval also writes an allow rule for the exact
  // target, so future runs don't ask for it again. The rules file is the
  // memory — clearing it resets everything (undo restores the backup).
  if (decision === 'approve' && decided) {
    grantForRun(runState.id, decided.permission, decided.target);
    try {
      const rules = loadRules();
      if (check(rules, decided.permission, decided.target) !== 'allow') {
        saveRules([{ permission: decided.permission, pattern: decided.target, action: 'allow' }, ...rules]);
      }
    } catch (err) {
      console.error('[approvals] persistent grant failed:', err instanceof Error ? err.message : String(err));
    }
  }
  // Resume carries its own session linkage inside the serialized state —
  // passing session again conflicts ("exactly one server-managed
  // conversation owner") and fails the resume.
  const stream = await runWithContext(runState.id, !!runState.parentId, () =>
    run(agent, state as never, { stream: true, maxTurns: 20 }),
  );
  void driveStream(runState, stream, Date.now()).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    runState.events.push({ type: 'error', error: `resume failed: ${msg}` });
    runState.parked = false;
    runState.done = true;
  });
  return true;
}

/** Audit hook: all tool audits are logged server-side only — approval cards
 * come solely from real SDK interruptions (driveStream). Emitting cards here
 * would duplicate every ask (the grant lookup runs on the same target the
 * interruption already used) and phantom-card child-run calls that already
 * executed. */
function auditTo(runId: string, allowedSkills?: string[]): GuardOpts {
  return {
    allowedSkills,
    onApproval: (a) => {
      console.log(`[${a.auto ? 'auto-allow' : 'ask-audit'}] run ${runId}: ${a.permission} "${a.target}"`);
    },
  };
}

export interface StartRunOpts {
  provider?: string;
  model?: string;
  parentId?: string;
  /** Nesting depth of `task` delegation; top-level runs are 0. */
  depth?: number;
  /** Conversation scope (frontend Bot id). One SDK session per id. */
  conversationId?: string;
  /** Per-bot skill allowlist (Bot.skillsEnabled). Undefined = all enabled; [] = none. */
  allowedSkills?: string[];
  /** Chief-of-staff run: exposes the create_bot tool (confirm card in frontend). */
  canManageBots?: boolean;
  /** Team roster (all bots incl. self) for @mentions. Only the chief thread sends it. */
  roster?: RosterEntry[];
  /** This run's bot name — [via …] tag on cross-bot messages. */
  botName?: string;
  /** Bot brief (name/role). Prepended as bracketed context on every turn; never persisted. */
  system?: string;
  /** Workspace-relative attachment paths (chat paperclip). Images are
   * inlined into the user message; other files become a read_file hint. */
  attachments?: string[];
  /** Subagent variant for `task` children. */
  subagentType?: 'general' | 'research';
  /** Resume this child session (task_id) instead of starting fresh. */
  resumeTaskId?: string;
  /** Delegated run (message_bot): acts under the parent's delegation grant —
   * tool asks auto-pass audit-logged like `task` children, instead of
   * parking on approvals nobody can see (only the chief's run streams). */
  delegated?: boolean;
}

/** Max `task` delegation depth. At the cap the tool stays visible but asks
 * the model to do the work inline instead of spawning (no missing-tool confusion). */
const MAX_TASK_DEPTH = 4;

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

function makeRunChild(runState: Run): (req: ChildRequest) => Promise<ChildResult> {
  const depth = runState.depth;
  return async (req) => {
    if (!req.taskId && depth + 1 >= MAX_TASK_DEPTH) {
      if (process.env.WAYFIND_DEBUG_EVENTS === '1') console.log(`[task] depth cap (${MAX_TASK_DEPTH}) — inline`);
      return {
        output: '<task_result>\nDepth cap reached — do this part yourself instead of delegating.\n</task_result>',
        taskId: '',
      };
    }
    // Children get only the delegated text (history isolation), so orient
    // fresh ones: without this they guess absolute paths, hit "escapes
    // workspace" errors, and report back "I can't". Resumed children keep
    // their session and get the new prompt as-is.
    const fresh = !req.taskId || !childSessions.has(req.taskId);
    const text = fresh
      ? `Workspace root: ${WORKSPACE_DIR}. All file paths are relative to it — never use absolute paths. ` +
        `Key files: providers.json (model/provider catalog), permissions.json (tool rules), skills/<name>/SKILL.md (skill docs). ` +
        `Prefer your read/list/glob/grep/skill tools over shell for inspection. Report paths tried plus the result.\n\nTask:\n\n${req.prompt}`
      : req.prompt;
    const label = req.description;
    runState.events.push({ type: 'agent', agent: `Subagent · ${label} — ${fresh ? 'started' : 'resumed'}` });
    appendTranscript(runState.id, 'tool', `Subagent · ${label} — ${fresh ? 'started' : 'resumed'}`, runState.parentId, runState.conversationId);
    try {
      const { output, taskId } = await runToCompletion(text, {
        provider: runState.sel.provider,
        model: runState.sel.model,
        parentId: runState.id,
        depth: fresh ? depth + 1 : depth,
        conversationId: runState.conversationId,
        allowedSkills: runState.allowedSkills,
        subagentType: req.subagentType,
        resumeTaskId: fresh ? undefined : req.taskId,
      });
      runState.events.push({ type: 'agent', agent: `Subagent · ${label} — finished` });
      appendTranscript(runState.id, 'tool', `Subagent · ${label} — finished`, runState.parentId, runState.conversationId);
      return { output, taskId };
    } catch (err) {
      runState.events.push({ type: 'agent', agent: `Subagent · ${label} — failed` });
      appendTranscript(runState.id, 'tool', `Subagent · ${label} — failed`, runState.parentId, runState.conversationId);
      throw err;
    }
  };
}

/** One SDK session per live child (task_id). Resuming continues the child. */
const childSessions = new Map<string, { session: MemorySession; depth: number }>();

/**
 * MessageRunner for the `message_bot` tool: run the message as a real turn
 * in the target bot's own conversation (its session, system, skills) and
 * return the reply. Transcript lines carry the target conversationId with
 * no parentId, so they render in that bot's thread — the user sees the
 * chief's message and the reply when they switch bots.
 */
function makeMessageRunner(runState: Run): MessageRunner {
  return async (botName: string, message: string) => {
    const roster = (runState.roster ?? []).filter((b) => b.id);
    const matches = roster.filter((b) => b.name.toLowerCase() === botName.toLowerCase());
    if (matches.length === 0) {
      throw new Error(
        `No bot named "${botName}". Available: ${roster.map((b) => b.name).join(', ') || 'none'}. ` +
          `Tell the user, or offer to create it with create_bot.`,
      );
    }
    if (matches.length > 1) {
      throw new Error(`There is more than one bot named "${botName}" — ask the user which one they mean.`);
    }
    const target = matches[0];
    if (runState.depth + 1 > MAX_TASK_DEPTH) {
      return 'Depth cap reached — answer from your own context instead of delegating.';
    }
    const sender = runState.botName?.trim() || 'Chief';
    const system = target.role
      ? `You are "${target.name}". Role: ${target.role}.`
      : `You are "${target.name}". Your role is not defined yet.`;
    runState.events.push({ type: 'agent', agent: `Messaged @${target.name}` });
    appendTranscript(runState.id, 'tool', `Messaged @${target.name}`, runState.parentId, runState.conversationId);
    try {
      const { output } = await runToCompletion(`[via ${sender}] ${message}`, {
        conversationId: target.id,
        system,
        allowedSkills: target.skills ?? undefined,
        depth: runState.depth + 1,
        delegated: true,
      });
      runState.events.push({ type: 'agent', agent: `@${target.name} replied` });
      appendTranscript(runState.id, 'tool', `@${target.name} replied`, runState.parentId, runState.conversationId);
      return output;
    } catch (err) {
      runState.events.push({ type: 'agent', agent: `@${target.name} — failed` });
      throw err;
    }
  };
}

/** Consume one streamed run to completion: chunks/agent events in, then
 * either done (finalOutput + usage) or parked (interruptions saved). */
async function driveStream(runState: Run, stream: unknown, startedAt: number): Promise<string> {
  const seenTypes = process.env.WAYFIND_DEBUG_EVENTS === '1' ? new Set<string>() : null;
  for await (const event of stream as unknown as Iterable<{
    type: string;
    name?: string;
    agent?: { name: string };
    item?: { rawItem?: { name?: string } };
    data?: { type: string; delta?: string };
  }>) {
    seenTypes?.add(event.type);
    if (event.type === 'raw_model_stream_event' && event.data?.type === 'output_text_delta' && event.data.delta) {
      runState.events.push({ type: 'chunk', chunk: event.data.delta });
    }
    // Long-running image calls get a visible progress row so the UI can
    // show a skeleton while Muse Image works (normal tools stay silent).
    if (event.type === 'run_item_stream_event' && event.name === 'tool_called') {
      const toolName = event.item?.rawItem?.name;
      if (toolName === 'generate_image' || toolName === 'edit_image') {
        const label = toolName === 'generate_image' ? 'Generating image…' : 'Editing image…';
        runState.events.push({ type: 'agent', agent: label });
        appendTranscript(runState.id, 'tool', label, runState.parentId, runState.conversationId);
      }
    }
    if (event.type === 'agent_updated_stream_event' && event.agent) {
      runState.events.push({ type: 'agent', agent: event.agent.name });
      appendTranscript(runState.id, 'tool', event.agent.name, runState.parentId, runState.conversationId);
    }
  }
  const result = stream as unknown as {
    finalOutput?: unknown;
    rawResponses?: unknown;
    interruptions?: Array<{
      rawItem: { callId?: string; name?: string; arguments?: string };
      agent?: { name?: string };
    }>;
    state: { toString(): string };
  };
  if (result.interruptions?.length) {
    runState.interruptions = result.interruptions.map((i) => {
      const toolName = i.rawItem.name ?? i.agent?.name ?? 'tool';
      return {
        id: i.rawItem.callId ?? randomUUID(),
        runId: runState.id,
        permission: toolName,
        target: describeTarget(toolName, i.rawItem.arguments ?? ''),
        requestedAt: new Date().toISOString(),
      };
    });
    runState.stateJson = result.state.toString();
    runState.parked = true;
    for (const p of runState.interruptions) {
      runState.events.push({
        type: 'approval',
        approvalId: p.id,
        permission: p.permission,
        target: p.target,
      });
    }
    if (seenTypes) console.log(`[debug] parked on ${runState.interruptions.length} interruption(s)`);
    return '';
  }
  const output = result.finalOutput;
  const textOut = typeof output === 'string' ? output : JSON.stringify(output ?? '');
  // Grounded-search citations arrive as url_citation annotations on the raw
  // response items — fold them into a Sources block so they survive in chat.
  const sources = extractWebSources(result.rawResponses);
  const withSources =
    sources.length > 0 && !/sources:/i.test(textOut)
      ? `${textOut}\n\nSources:\n${sources.map((s) => `- [${s.title}](${s.url})`).join('\n')}`
      : textOut;
  runState.output = withSources;
  runState.toolCalls = toolCallCount(runState.id);
  runState.events.push({ type: 'done', output: withSources, toolCalls: runState.toolCalls });
  appendTranscript(runState.id, 'assistant', withSources, runState.parentId, runState.conversationId);
  if (seenTypes) console.log(`[debug] stream event types: ${[...seenTypes].join(', ')}`);
  await reportUsage({
    runId: runState.id,
    model: runState.model,
    provider: runState.provider,
    durationMs: Date.now() - startedAt,
    outputChars: withSources.length,
    toolCalls: runState.toolCalls,
    costPer1M: resolveModel(runState.sel.provider, runState.sel.model).cost,
    at: new Date().toISOString(),
  });
  runState.done = true;
  runState.parked = false;
  clearRunLog(runState.id);
  return withSources;
}

/** Pull url_citation annotations out of raw Responses-API output items. */
function extractWebSources(raw: unknown): Array<{ title: string; url: string }> {
  const out: Array<{ title: string; url: string }> = [];
  const seen = new Set<string>();
  const responses = Array.isArray(raw) ? raw : [];
  for (const r of responses) {
    const items = (r as { output?: unknown })?.output;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const content = (item as { content?: unknown })?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        const annotations = (block as { annotations?: unknown })?.annotations;
        if (!Array.isArray(annotations)) continue;
        for (const a of annotations) {
          const ann = a as { type?: string; url?: string; title?: string };
          if (ann?.type === 'url_citation' && ann.url && !seen.has(ann.url)) {
            seen.add(ann.url);
            out.push({ title: ann.title ?? ann.url, url: ann.url });
          }
        }
      }
    }
  }
  return out;
}

async function executeRun(runState: Run, text: string, opts: StartRunOpts): Promise<string> {
  const startedAt = Date.now();
  try {
    const agent = await createTriageAgent(auditTo(runState.id, runState.allowedSkills), runState.sel, makeRunChild(runState), makeQuestionHook(runState), runState.canManageBots ? makeBotRequestHook(runState) : undefined, runState.canManageBots ? { send: makeMessageRunner(runState), roster: (runState.roster ?? []).filter((b) => b.id) } : undefined);
    // History isolation: children get ONLY their prompt. Top-level input is
    // the live turn (plus JSONL seed on first contact); the session carries
    // everything else. The brief rides bracketed every turn, never persisted.
    const liveText = !runState.parentId && opts.system ? `[${opts.system}]\n\n${text}` : text;
    const input = (
      runState.parentId
        ? [userMessage(text)]
        : [...seedFor(opts.conversationId), userMessage(liveText, opts.attachments)]
    ) as never;
    let session: MemorySession | undefined;
    if (!runState.parentId) {
      session = sessionFor(opts.conversationId);
    } else if (opts.resumeTaskId && childSessions.has(opts.resumeTaskId)) {
      session = childSessions.get(opts.resumeTaskId)?.session;
    } else {
      session = new MemorySession();
      childSessions.set(runState.id, { session, depth: runState.depth });
    }
    const stream = await runWithContext(runState.id, !!runState.parentId || !!opts.delegated, () =>
      run(agent, input, {
        stream: true,
        maxTurns: 20,
        ...(session ? { session: session as never } : {}),
      }),
    );
    return await driveStream(runState, stream, startedAt);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runState.events.push({ type: 'error', error: msg });
    appendTranscript(runState.id, 'system', `error: ${msg}`, runState.parentId, runState.conversationId);
    runState.done = true;
    runState.parked = false;
    clearRunLog(runState.id);
    throw err instanceof Error ? err : new Error(msg);
  }
}

function newRunState(opts: StartRunOpts): Run {
  return {
    id: randomUUID(),
    parentId: opts.parentId,
    model: opts.model ?? PROVIDER_MODEL,
    provider: opts.provider ?? 'default',
    sel: {
      provider: opts.provider,
      model: opts.model,
      ...(opts.subagentType ? { variant: opts.subagentType === 'research' ? ('research' as const) : ('full' as const) } : {}),
    },
    conversationId: opts.conversationId,
    allowedSkills: opts.allowedSkills,
    canManageBots: opts.canManageBots,
    roster: opts.roster,
    botName: opts.botName,
    depth: opts.depth ?? 0,
    events: [],
    done: false,
    parked: false,
    interruptions: [],
    output: '',
    toolCalls: 0,
    startedAt: new Date().toISOString(),
  };
}

export function startRun(text: string, opts: StartRunOpts): Run {
  const runState = newRunState(opts);
  runs.set(runState.id, runState);
  // Persist attachment paths (not bytes) so history shows what was sent
  // without replaying megabytes of base64 on rehydrate.
  const marker = opts.attachments?.length ? ` [attached: ${opts.attachments.slice(0, 5).join(', ')}]` : '';
  appendTranscript(runState.id, 'user', text + marker, runState.parentId, opts.conversationId);
  void executeRun(runState, text, opts).catch(() => {});
  return runState;
}

/** Blocking child run for the `task` tool — returns output + child task_id. */
export async function runToCompletion(
  text: string,
  opts: StartRunOpts,
): Promise<{ output: string; taskId: string }> {
  const release = await acquireChildSlot();
  try {
    const runState = newRunState(opts);
    runs.set(runState.id, runState);
    appendTranscript(runState.id, 'user', text, runState.parentId, opts.conversationId);
    const output = await executeRun(runState, text, opts);
    return { output, taskId: runState.id };
  } finally {
    release();
  }
}
