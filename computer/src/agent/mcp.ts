// MCP client (stdio only, P1): reads workspace/mcp.json, spawns each
// configured server, converts its tools to agent tools. Remote/streamable
// transports land in P2.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { tool } from '@openai/agents';
import { z } from 'zod';
import { WORKSPACE_DIR } from '../core/config.js';

import { approvalPolicy, guarded, type GuardOpts } from '../core/guard.js';
export interface McpServerConfig {
  command?: string[];
  environment?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  /** Absent = active. Mirrors the skills allowlist semantics: unconfigured = on. */
  isActive?: boolean;
  disabledTools?: string[];
}

interface McpJson {
  mcpServers?: Record<string, McpServerConfig>;
}

function sanitize(s: string): string {
  return s.replace(/[^A-Za-z0-9_.-]/g, '_');
}

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  description?: string;
  default?: unknown;
};

/** Top-level shape: object schemas map flat, others use one `input` field. */
function shapeOf(schema: JsonSchema | undefined): z.ZodObject<Record<string, z.ZodTypeAny>> {
  if (schema?.type === 'object' || (!schema?.type && schema?.properties)) {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [k, v] of Object.entries(schema.properties ?? {})) {
      const field = toZod(v);
      shape[k] = schema.required?.includes(k) ? field : field.optional();
    }
    return z.object(shape);
  }
  return z.object({ input: toZod(schema).optional() });
}
function toZod(schema: JsonSchema | undefined): z.ZodTypeAny {
  if (!schema || typeof schema !== 'object') return z.unknown();
  if (schema.enum) return z.enum(schema.enum as [string, ...string[]]).describe(schema.description ?? '');
  switch (schema.type) {
    case 'string':
      return z.string().describe(schema.description ?? '');
    case 'number':
      return z.number().describe(schema.description ?? '');
    case 'integer':
      return z.number().int().describe(schema.description ?? '');
    case 'boolean':
      return z.boolean().describe(schema.description ?? '');
    case 'array':
      return z.array(toZod(schema.items)).describe(schema.description ?? '');
    case 'object': {
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [k, v] of Object.entries(schema.properties ?? {})) {
        const field = toZod(v);
        shape[k] = schema.required?.includes(k) ? field : field.optional();
      }
      return z.object(shape).describe(schema.description ?? '');
    }
    default:
      return z.unknown().describe(schema.description ?? '');
  }
}

export interface McpServerInfo {
  name: string;
  type: 'stdio' | 'remote';
  isActive: boolean;
  /** Env/header key names only — values never leave the computer. */
  configKeys: string[];
  disabledTools: string[];
}

const MCP_NAME_RE = /^[A-Za-z0-9_-]+$/;

/** Read the raw server map. Missing file = no servers; corrupt file = no servers (logged). */
export function readMcpConfig(): Record<string, McpServerConfig> {
  const path = join(WORKSPACE_DIR, 'mcp.json');
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as McpJson;
    return parsed.mcpServers ?? {};
  } catch {
    console.error('mcp.json is not valid JSON — skipping MCP servers');
    return {};
  }
}

function writeMcpConfig(servers: Record<string, McpServerConfig>): void {
  writeFileSync(join(WORKSPACE_DIR, 'mcp.json'), JSON.stringify({ mcpServers: servers }, null, 2));
}

/** Settings-list view: no secrets, command[0] + url only as type hints. */
export function listMcpServers(): McpServerInfo[] {
  return Object.entries(readMcpConfig()).map(([name, cfg]) => ({
    name,
    type: cfg?.url ? 'remote' : 'stdio',
    isActive: cfg?.isActive !== false,
    configKeys: Object.keys(cfg?.url ? (cfg.headers ?? {}) : (cfg?.environment ?? {})),
    disabledTools: cfg?.disabledTools ?? [],
  }));
}

function checkServerInput(name: string, cfg: Partial<McpServerConfig>): string | null {
  if (!MCP_NAME_RE.test(name)) return 'name must match [A-Za-z0-9_-]+';
  const hasCommand = Array.isArray(cfg.command) && cfg.command.length > 0 && cfg.command.every((s) => typeof s === 'string' && s);
  const hasUrl = typeof cfg.url === 'string' && cfg.url.length > 0;
  if (hasCommand && hasUrl) return 'set command[] or url, not both';
  if (!hasCommand && !hasUrl) return 'server needs command[] or url';
  return null;
}

function cleanConfig(cfg: Partial<McpServerConfig>): McpServerConfig {
  const out: McpServerConfig = {};
  if (Array.isArray(cfg.command)) out.command = cfg.command;
  if (cfg.environment && typeof cfg.environment === 'object') out.environment = cfg.environment;
  if (typeof cfg.url === 'string') out.url = cfg.url;
  if (cfg.headers && typeof cfg.headers === 'object') out.headers = cfg.headers;
  if (cfg.isActive === false) out.isActive = false;
  if (Array.isArray(cfg.disabledTools)) out.disabledTools = cfg.disabledTools.filter((t) => typeof t === 'string');
  return out;
}

/** Create. Returns 'exists' when the name is taken, or an error message. */
export function saveMcpServer(name: string, cfg: Partial<McpServerConfig>): { ok: true } | { ok: false; error: string } {
  const servers = readMcpConfig();
  if (servers[name]) return { ok: false, error: 'exists' };
  const err = checkServerInput(name, cfg);
  if (err) return { ok: false, error: err };
  servers[name] = cleanConfig(cfg);
  writeMcpConfig(servers);
  return { ok: true };
}

/** Partial update (toggle active, edit env/headers, disable tools). */
export function patchMcpServer(name: string, cfg: Partial<McpServerConfig>): { ok: true } | { ok: false; error: string } {
  const servers = readMcpConfig();
  const prev = servers[name];
  if (!prev) return { ok: false, error: 'unknown server' };
  const merged = { ...prev, ...cleanConfig(cfg) };
  // Switching transport drops the other side's fields.
  if (cfg.url !== undefined) { delete merged.command; delete merged.environment; }
  if (cfg.command !== undefined) { delete merged.url; delete merged.headers; }
  // Explicit true clears a stored false (absent = active).
  if (cfg.isActive === true) delete merged.isActive;
  const err = checkServerInput(name, merged);
  if (err) return { ok: false, error: err };
  servers[name] = merged;
  writeMcpConfig(servers);
  return { ok: true };
}

export function removeMcpServer(name: string): boolean {
  const servers = readMcpConfig();
  if (!servers[name]) return false;
  delete servers[name];
  writeMcpConfig(servers);
  return true;
}

export async function loadMcpTools(opts: GuardOpts): Promise<Array<ReturnType<typeof tool>>> {
  const servers = readMcpConfig();
  const tools: Array<ReturnType<typeof tool>> = [];
  for (const [serverName, cfg] of Object.entries(servers)) {
    if (cfg.isActive === false) continue;
    const disabled = new Set(cfg.disabledTools ?? []);
    let transport;
    if (cfg?.url) {
      transport = new StreamableHTTPClientTransport(new URL(cfg.url), {
        requestInit: { headers: cfg.headers ?? {} },
      });
    } else if (cfg?.command?.length) {
      transport = new StdioClientTransport({
        command: cfg.command[0],
        args: cfg.command.slice(1),
        env: { ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined) as [string, string][]), ...(cfg.environment ?? {}) },
      });
    } else {
      console.error(`MCP server "${serverName}" needs command[] or url — skipping`);
      continue;
    }
    try {
      const client = new Client({ name: 'wayfind-computer', version: '0.1.0' });
      await client.connect(transport);
      const listed = await client.listTools();
      for (const t of listed.tools) {
        if (disabled.has(t.name)) continue;
        const toolName = `${sanitize(serverName)}_${sanitize(t.name)}`;
        tools.push(
          tool({
            name: toolName,
            description: t.description ?? `MCP tool ${t.name} from ${serverName}`,
            // MCP inputSchema is JSON Schema — convert to zod for validation.
            // Object schemas map flat (what the server expects); anything
            // else falls back to a single `input` field.
            parameters: shapeOf(t.inputSchema as JsonSchema | undefined),
            execute: guarded(`mcp:${serverName}`, () => t.name, async (args: unknown) => {
              const res = await client.callTool({
                name: t.name,
                arguments: (args ?? {}) as Record<string, unknown>,
              });
              const content = (res as { content?: Array<{ type: string; text?: string }> }).content ?? [];
              return (
                content
                  .map((c) => (c.type === 'text' ? (c.text ?? '') : `[${c.type}]`))
                  .join('\n') || '(no output)'
              );
            }, opts),
            needsApproval: approvalPolicy(`mcp:${serverName}`, () => t.name),
          }),
        );
      }
      console.log(`MCP: ${serverName} → ${listed.tools.length} tools`);
    } catch (err) {
      console.error(`MCP server "${serverName}" failed:`, err instanceof Error ? err.message : err);
    }
  }
  return tools;
}
