// Interactive terminal sessions over WebSocket (`wss://<endpoint>/term`).
// One node-pty `bash` per connection. Proxy auth (short-lived, port-scoped
// token via WS subprotocols) already happened before upgrade reaches us —
// possession of that token means the backend minted it for the owner.
//
// Protocol (JSON frames):
//   client -> { type: 'input', data: string }      // keystrokes / paste
//   client -> { type: 'resize', cols: number, rows: number }
//   client -> { type: 'ping' }                     // keepalive
//   server -> { type: 'output', data: string }     // pty bytes (base64? no — raw utf8)
//   server -> { type: 'exit', code: number }
//   server -> { type: 'error', error: string }
//
// Guardrails: max 2 concurrent sessions, 10-min idle kill, 5 MB output cap
// per session, audit metadata only (start/end, byte counts — never content).
import { existsSync } from 'node:fs';
import type { Server } from 'node:http';
import type { Socket } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import { spawn, type IPty } from 'node-pty';
import { WORKSPACE_DIR } from '../core/config.js';

const MAX_SESSIONS = 2;
const IDLE_MS = 10 * 60 * 1000;
const OUTPUT_CAP_BYTES = 5 * 1024 * 1024;

/** Secret env names that must never reach the interactive shell. */
const SECRET_ENV = ['MODAL_API_KEY', 'PROVIDER_API_KEY', 'NEARAI_CLOUD_API_KEY', 'USAGE_TOKEN', 'KANE_USERNAME', 'KANE_ACCESS_KEY'];

interface TermSession {
  id: string;
  pty: IPty;
  ws: WebSocket;
  startedAt: number;
  lastActive: number;
  bytesOut: number;
  timer: NodeJS.Timeout;
}

const sessions = new Map<string, TermSession>();

function sessionCount(): number {
  return sessions.size;
}

function killSession(id: string, reason: string): void {
  const s = sessions.get(id);
  if (!s) return;
  clearInterval(s.timer);
  sessions.delete(id);
  try {
    s.pty.kill();
  } catch {
    // already dead
  }
  try {
    s.ws.send(JSON.stringify({ type: 'exit', code: -1, reason }));
    s.ws.close();
  } catch {
    // already closed
  }
  console.log(`[terminal] session end id=${id} reason=${reason} bytesOut=${s.bytesOut} durationMs=${Date.now() - s.startedAt}`);
}

export function activeTerminalSessions(): number {
  return sessions.size;
}

export function killAllTerminals(): void {
  for (const id of [...sessions.keys()]) killSession(id, 'terminate');
}

function scrubbedEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env, TERM: 'xterm-256color' };
  for (const k of SECRET_ENV) delete env[k];
  return env;
}

export function attachTerminalServer(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket: Socket, head: Buffer) => {
    let path = '';
    try {
      path = new URL(req.url ?? '/', 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (path !== '/term') return; // not ours — leave for other upgrade handlers
    if (sessionCount() >= MAX_SESSIONS) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => openSession(ws));
  });

  // Idle reaper: one timer per session is simpler than a sweeper and dies with it.
  function armIdleTimer(s: TermSession): void {
    clearInterval(s.timer);
    s.timer = setInterval(() => {
      if (Date.now() - s.lastActive > IDLE_MS) killSession(s.id, 'idle');
    }, 60_000);
    // Don't hold the event loop for timers alone.
    if (typeof (s.timer as unknown as { unref?: () => void }).unref === 'function') {
      (s.timer as unknown as { unref: () => void }).unref();
    }
  }

  function openSession(ws: WebSocket): void {
    const id = `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffff).toString(16)}`;
    // bash is in the image (Dockerfile). Detect up front — node-pty reports
    // a missing binary asynchronously, after the session would be open.
    const shell =
      process.platform === 'win32' ? 'powershell.exe' : existsSync('/bin/bash') ? 'bash' : 'sh';
    let pty: IPty;
    try {
      pty = spawn(shell, shell === 'bash' ? ['--noprofile', '--norc'] : [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: WORKSPACE_DIR,
        env: scrubbedEnv() as Record<string, string>,
      });
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', error: `pty spawn failed: ${err instanceof Error ? err.message : String(err)}` }));
      ws.close();
      return;
    }
    const s: TermSession = {
      id,
      pty,
      ws,
      startedAt: Date.now(),
      lastActive: Date.now(),
      bytesOut: 0,
      timer: undefined as unknown as NodeJS.Timeout,
    };
    sessions.set(id, s);
    armIdleTimer(s);
    console.log(`[terminal] session start id=${id} sessions=${sessions.size}`);

    const touch = () => {
      s.lastActive = Date.now();
    };

    pty.onData((data: string) => {
      touch();
      s.bytesOut += Buffer.byteLength(data);
      if (s.bytesOut > OUTPUT_CAP_BYTES) {
        killSession(id, 'output-cap');
        return;
      }
      try {
        ws.send(JSON.stringify({ type: 'output', data }));
      } catch {
        killSession(id, 'send-failed');
      }
    });

    pty.onExit(({ exitCode }: { exitCode: number }) => {
      try {
        ws.send(JSON.stringify({ type: 'exit', code: exitCode }));
      } catch {
        // client gone
      }
      try {
        ws.close();
      } catch {
        // already closed
      }
      clearInterval(s.timer);
      sessions.delete(id);
      console.log(`[terminal] session end id=${id} reason=shell-exit bytesOut=${s.bytesOut} durationMs=${Date.now() - s.startedAt}`);
    });

    ws.on('message', (raw: Buffer) => {
      touch();
      let msg: { type?: string; data?: unknown; cols?: unknown; rows?: unknown };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.type === 'ping') {
        try {
          ws.send(JSON.stringify({ type: 'pong' }));
        } catch {
          // ignore
        }
        return;
      }
      if (msg.type === 'resize') {
        const cols = Number(msg.cols);
        const rows = Number(msg.rows);
        if (Number.isFinite(cols) && Number.isFinite(rows) && cols > 0 && rows > 0 && cols <= 500 && rows <= 200) {
          try {
            pty.resize(Math.floor(cols), Math.floor(rows));
          } catch {
            // ignore
          }
        }
        return;
      }
      if (msg.type === 'input' && typeof msg.data === 'string' && msg.data.length > 0) {
        // Bound single writes so a pasted MB doesn't stall the loop.
        const chunk = msg.data.slice(0, 65536);
        try {
          pty.write(chunk);
        } catch {
          killSession(id, 'write-failed');
        }
      }
    });

    ws.on('close', () => killSession(id, 'client-close'));
    ws.on('error', () => killSession(id, 'ws-error'));
  }
}
