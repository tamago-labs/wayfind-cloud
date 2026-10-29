// Agent HTTP + SSE server. Serves the browser direct (SSE) and the
// MicroVM lifecycle hooks. P0 routes only; auth + approvals land in P1.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { PORT, PROVIDER_BASE_URL, PROVIDER_MODEL, WORKSPACE_DIR, requireApiKey } from './core/config.js';
import { permissionMode } from './core/guard.js';
import { hasSearchKey } from './agent/tools/web.js';
import { initProvider } from './providers/provider.js';
import { getRun, getHistory, listPendingApprovals, listPendingQuestions, listRuns, resolveApproval, answerQuestion, startRun } from './runs/runner.js';
import { maskedKeys, writeKey } from './providers/keystore.js';
import { loadSkills } from './agent/skills.js';

/** Browser origin for local dev (Amplify dev server). Loosen only for local. */
const CORS_ORIGIN = process.env.AGENT_CORS_ORIGIN ?? '*';

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...corsHeaders() });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sse(res: ServerResponse, runId: string): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    ...corsHeaders(),
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  let cursor = 0;
  let ticks = 0;
  const timer = setInterval(() => {
    const r = getRun(runId);
    if (!r) {
      res.write(`data: ${JSON.stringify({ error: 'unknown run' })}\n\n`);
      clearInterval(timer);
      res.end();
      return;
    }
    let wrote = false;
    while (cursor < r.events.length) {
      res.write(`data: ${JSON.stringify(r.events[cursor])}\n\n`);
      cursor += 1;
      wrote = true;
    }
    // Heartbeat comment every ~15s of silence: keeps long runs (parallel
    // subagents, parked approvals) alive through idle-killing proxies, and
    // is ignored by SSE clients (not a `data:` line).
    ticks += 1;
    if (!wrote && ticks % 60 === 0) res.write(': ping\n\n');
    if (r.done) {
      clearInterval(timer);
      res.end();
    }
  }, 250);
  timer.unref?.();
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const { pathname } = url;
  const method = req.method ?? 'GET';

  // CORS preflight for browser clients (local dev).
  if (method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    return void res.end();
  }

  // Lifecycle hooks (mounted by the image under /aws/lambda-microvms/runtime/v1/*).
  if (pathname === '/ready' && method === 'GET') return void json(res, 200, { ok: true });
  if (pathname === '/hooks/run' && method === 'POST') return void json(res, 200, { ok: true });
  if (pathname === '/hooks/suspend' && method === 'POST') return void json(res, 200, { ok: true });
  if (pathname === '/hooks/resume' && method === 'POST') return void json(res, 200, { ok: true });
  if (pathname === '/hooks/terminate' && method === 'POST') return void json(res, 200, { ok: true });
  if (pathname === '/status' && method === 'GET') {
    return void json(res, 200, {
      ok: true,
      workspace: WORKSPACE_DIR,
      permissionMode: permissionMode(),
      search: hasSearchKey(),
      provider: { baseURL: PROVIDER_BASE_URL, model: PROVIDER_MODEL },
      runs: listRuns().map((r) => ({ id: r.id, done: r.done, startedAt: r.startedAt })),
    });
  }

  if (pathname === '/task' && method === 'POST') {
    try {
      const { text, conversationId, system, provider, model } = JSON.parse(await readBody(req)) as {
        text?: string;
        conversationId?: string;
        system?: string;
        provider?: string;
        model?: string;
      };
      if (!text || typeof text !== 'string') return void json(res, 400, { error: 'Body must be { text, provider?, model? }' });
      if (conversationId !== undefined && typeof conversationId !== 'string') {
        return void json(res, 400, { error: 'conversationId must be a string' });
      }
      const r = startRun(text, { provider, model, conversationId, system });
      return void json(res, 202, { runId: r.id });
    } catch {
      return void json(res, 400, { error: 'Invalid JSON body' });
    }
  }

  const historyMatch = pathname.match(/^\/history\/([A-Za-z0-9-]+)$/);
  if (historyMatch && method === 'GET') {
    return void json(res, 200, { messages: getHistory(historyMatch[1]) });
  }

  if (pathname === '/approvals' && method === 'GET') {
    return void json(res, 200, { approvals: listPendingApprovals() });
  }

  if (pathname === '/questions' && method === 'GET') {
    return void json(res, 200, { questions: listPendingQuestions() });
  }

  const questionMatch = pathname.match(/^\/questions\/([A-Za-z0-9-]+)$/);
  if (questionMatch && method === 'POST') {
    try {
      const { answers } = JSON.parse(await readBody(req)) as { answers?: string[][] };
      if (!Array.isArray(answers)) {
        return void json(res, 400, { error: 'Body must be { answers: string[][] }' });
      }
      const ok = answerQuestion(questionMatch[1], answers);
      return void json(res, ok ? 200 : 404, ok ? { ok: true } : { error: 'unknown question' });
    } catch {
      return void json(res, 400, { error: 'Invalid JSON body' });
    }
  }

  const approvalMatch = pathname.match(/^\/approvals\/([A-Za-z0-9_-]+)$/);
  if (approvalMatch && method === 'POST') {
    try {
      const { decision } = JSON.parse(await readBody(req)) as { decision?: string };
      if (decision !== 'approve' && decision !== 'reject') {
        return void json(res, 400, { error: 'Body must be { decision: "approve" | "reject" }' });
      }
      // SDK-native resume: the parked RunState continues from the interruption.
      try {
        const ok = await resolveApproval(approvalMatch[1], decision);
        return void json(res, ok ? 200 : 404, ok ? { ok: true } : { error: 'unknown approval' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[approvals] resume failed:', msg);
        return void json(res, 500, { error: `resume failed: ${msg}` });
      }
    } catch {
      return void json(res, 400, { error: 'Invalid JSON body' });
    }
  }

  // Privileged key-write channel (backend only in production — P2 adds auth).
  if (pathname === '/keys' && method === 'POST') {
    try {
      const { name, value } = JSON.parse(await readBody(req)) as { name?: string; value?: string };
      if (!name || !value) return void json(res, 400, { error: 'Body must be { name, value }' });
      writeKey(name, value);
      return void json(res, 200, { ok: true, keys: maskedKeys() });
    } catch {
      return void json(res, 400, { error: 'Invalid JSON body' });
    }
  }

  if (pathname === '/skills' && method === 'GET') {
    return void json(res, 200, {
      skills: loadSkills().map((s) => ({ name: s.name, description: s.description })),
    });
  }

  const streamMatch = pathname.match(/^\/stream\/([A-Za-z0-9-]+)$/);
  if (streamMatch && method === 'GET') return void sse(res, streamMatch[1]);

  return void json(res, 404, { error: 'not found' });
}

requireApiKey();
initProvider();
const server = createServer((req, res) => {
  void handle(req, res).catch((err: unknown) => {
    console.error('request failed:', err);
    if (!res.headersSent) json(res, 500, { error: 'internal error' });
  });
});
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`port ${PORT} is already in use — an old server is still running. Kill it first (it keeps serving STALE code).`);
    process.exit(1);
  }
  throw err;
});
server.listen(PORT, () => {
  console.log(`wayfind agent listening on :${PORT} (workspace ${WORKSPACE_DIR})`);
});
