// Built-in tools, opencode-shaped: {id, description, parameters, execute→string}.
// P0 set: shell/read/write/list. Permission gating (allow/deny/ask) lands in P1.
import { execFile } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tool } from '@openai/agents';
import { z } from 'zod';
import { WORKSPACE_DIR } from '../config.js';

const ROOT = resolve(WORKSPACE_DIR);
const MAX_OUTPUT = 20_000;

function inside(p: string): string {
  const full = resolve(ROOT, p);
  if (full !== ROOT && !full.startsWith(ROOT + '/')) throw new Error(`Path escapes workspace: ${p}`);
  return full;
}

function truncate(s: string): string {
  return s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + `\n…(truncated, ${s.length} chars total)` : s;
}

export const shellTool = tool({
  name: 'shell',
  description: 'Run a shell command inside the workspace (sh -c). Use for searching, running scripts, inspecting files.',
  parameters: z.object({
    command: z.string().describe('Shell command to run'),
    timeoutMs: z.number().optional().describe('Kill after this many ms (default 60000)'),
  }),
  execute: async ({ command, timeoutMs }: { command: string; timeoutMs?: number }) =>
    new Promise<string>((resolvePromise) => {
      execFile(
        'sh',
        ['-c', command],
        { cwd: ROOT, timeout: timeoutMs ?? 60_000, maxBuffer: 4 * 1024 * 1024 },
        (err, stdout, stderr) => {
          const tail = err ? `exit=${(err as { code?: unknown }).code ?? '?'} ` : '';
          resolvePromise(truncate(`${tail}${stdout}${stderr}`) || '(no output)');
        },
      );
    }),
});

export const readTool = tool({
  name: 'read',
  description: 'Read a text file from the workspace.',
  parameters: z.object({ path: z.string().describe('Workspace-relative file path') }),
  execute: async ({ path }: { path: string }) => truncate(readFileSync(inside(path), 'utf8')),
});

export const writeTool = tool({
  name: 'write',
  description: 'Write (create or overwrite) a text file in the workspace.',
  parameters: z.object({
    path: z.string().describe('Workspace-relative file path'),
    content: z.string().describe('Full file content'),
  }),
  execute: async ({ path, content }: { path: string; content: string }) => {
    const full = inside(path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
    return `Wrote ${content.length} chars to ${path}`;
  },
});

export const listTool = tool({
  name: 'list',
  description: 'List files and directories under a workspace path.',
  parameters: z.object({ path: z.string().optional().describe('Workspace-relative dir (default .)') }),
  execute: async ({ path }: { path?: string }) => {
    const full = inside(path ?? '.');
    const entries = readdirSync(full).map((e) => (statSync(join(full, e)).isDirectory() ? e + '/' : e));
    return truncate(entries.join('\n') || '(empty)');
  },
});

export const builtinTools = [shellTool, readTool, writeTool, listTool];
