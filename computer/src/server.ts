// Agent HTTP + SSE server. Serves the browser direct (SSE) and the
// MicroVM lifecycle hooks. P0 routes only; auth + approvals land in P1.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { PORT, PROVIDER_BASE_URL, PROVIDER_MODEL, WORKSPACE_DIR, requireApiKey } from './config.js';
import { initProvider } from './provider.js';
import { getRun, listRuns, startRun } from './runner.js';
import { maskedKeys, writeKey } from './keystore.js';
import { loadSkills } from './skills.js';

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
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
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  let cursor = 0;
  const timer = setInterval(() => {
    const r = getRun(runId);
    if (!r) {
      res.write(`data: ${JSON.stringify({ error: 'unknown run' })}\n\n`);
      clearInterval(timer);
      res.end();
      return;
    }
    while (cursor < r.events.length) {
      res.write(`data: ${JSON.stringify(r.events[cursor])}\n\n`);
      cursor += 1;
    }
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
      provider: { baseURL: PROVIDER_BASE_URL, model: PROVIDER_MODEL },
      runs: listRuns().map((r) => ({ id: r.id, done: r.done, startedAt: r.startedAt })),
    });
  }

  if (pathname === '/task' && method === 'POST') {
    try {
      const { text } = JSON.parse(await readBody(req)) as { text?: string };
      if (!text || typeof text !== 'string') return void json(res, 400, { error: 'Body must be { text: string }' });
      const r = await startRun(text, { interactive: false });
      return void json(res, 202, { runId: r.id });
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
createServer((req, res) => {
  void handle(req, res).catch((err: unknown) => {
    console.error('request failed:', err);
    if (!res.headersSent) json(res, 500, { error: 'internal error' });
  });
}).listen(PORT, () => {
  console.log(`wayfind agent listening on :${PORT} (workspace ${WORKSPACE_DIR})`);
});
