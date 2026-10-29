// Built-in tools, opencode-shaped: {id, description, parameters, execute→string}.
// P0 set: shell/read/write/list. Every execute routes through the shared
// guard (allow/deny/ask + doom-loop). Use createBuiltinTools(opts).
import { execFile } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { tool } from '@openai/agents';
import { z } from 'zod';
import { WORKSPACE_DIR } from '../../core/config.js';

import { approvalPolicy, guarded, type GuardOpts } from '../../core/guard.js';
const ROOT = resolve(WORKSPACE_DIR);
const MAX_OUTPUT = 20_000;

function inside(p: string): string {
  // Models often emit `/skills`, `\skills`, or repo-rooted `workspace/skills`.
  // Normalize to workspace-relative instead of rejecting outright.
  const cleaned = p.replace(/^[/\\]+/, '').replace(/^workspace[/\\]/, '');
  const full = resolve(ROOT, cleaned || '.');
  // Separator-aware containment (ROOT + '/' breaks on Windows backslashes).
  const rel = relative(ROOT, full);
  if (rel !== '' && (rel.startsWith('..') || isAbsolute(rel))) {
    throw new Error(`Path escapes workspace: ${p}`);
  }
  return full;
}

function truncate(s: string): string {
  return s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + `\n…(truncated, ${s.length} chars total)` : s;
}

function runShell(command: string, timeoutMs?: number): Promise<string> {
  return new Promise<string>((resolvePromise) => {
    execFile(
      'sh',
      ['-c', command],
      { cwd: ROOT, timeout: timeoutMs ?? 60_000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const tail = err ? `exit=${(err as { code?: unknown }).code ?? '?'} ` : '';
        resolvePromise(truncate(`${tail}${stdout}${stderr}`) || '(no output)');
      },
    );
  });
}

export function createBuiltinTools(opts: GuardOpts): Array<ReturnType<typeof tool>> {
  const shell = tool({
    name: 'shell',
    description: 'Run a shell command inside the workspace (sh -c). Use for running scripts and inspecting files.',
    parameters: z.object({
      command: z.string().describe('Shell command to run'),
      timeoutMs: z.number().optional().describe('Kill after this many ms (default 60000)'),
    }),
    execute: guarded('shell', (a: { command: string }) => a.command, (a: { command: string; timeoutMs?: number }) =>
      runShell(a.command, a.timeoutMs),
    opts),
    needsApproval: approvalPolicy('shell', (a: { command: string }) => a.command),
  });

  const read = tool({
    name: 'read',
    description: 'Read a text file from the workspace.',
    parameters: z.object({ path: z.string().describe('Workspace-relative file path') }),
    execute: guarded('read', (a: { path: string }) => a.path, async (a: { path: string }) =>
      truncate(readFileSync(inside(a.path), 'utf8')),
    opts),
    needsApproval: approvalPolicy('read', (a: { path: string }) => a.path),
  });

  const write = tool({
    name: 'write',
    description: 'Write (create or overwrite) a text file in the workspace.',
    parameters: z.object({
      path: z.string().describe('Workspace-relative file path'),
      content: z.string().describe('Full file content'),
    }),
    execute: guarded(
      'write',
      (a: { path: string }) => a.path,
      async (a: { path: string; content: string }) => {
        const full = inside(a.path);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, a.content);
        return `Wrote ${a.content.length} chars to ${a.path}`;
      },
      opts,
    ),
    needsApproval: approvalPolicy('write', (a: { path: string }) => a.path),
  });

  const list = tool({
    name: 'list',
    description: 'List files and directories under a workspace path.',
    parameters: z.object({ path: z.string().optional().describe('Workspace-relative dir (default .)') }),
    execute: guarded('list', (a: { path?: string }) => a.path ?? '.', async (a: { path?: string }) => {
      const full = inside(a.path ?? '.');
      const entries = readdirSync(full).map((e) => (statSync(join(full, e)).isDirectory() ? e + '/' : e));
      return truncate(entries.join('\n') || '(empty)');
    }, opts),
    needsApproval: approvalPolicy('list', (a: { path?: string }) => a.path ?? '.'),
  });

  return [shell, read, write, list];
}
