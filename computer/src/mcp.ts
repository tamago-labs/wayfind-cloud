// MCP client (stdio only, P1): reads workspace/mcp.json, spawns each
// configured server, converts its tools to agent tools. Remote/streamable
// transports land in P2.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { tool } from '@openai/agents';
import { z } from 'zod';
import { WORKSPACE_DIR } from './config.js';
import { guarded, type GuardOpts } from './guard.js';

interface McpServerConfig {
  command?: string[];
  environment?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
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

export async function loadMcpTools(opts: GuardOpts): Promise<Array<ReturnType<typeof tool>>> {
  const path = join(WORKSPACE_DIR, 'mcp.json');
  if (!existsSync(path)) return [];
  let parsed: McpJson;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as McpJson;
  } catch {
    console.error('mcp.json is not valid JSON — skipping MCP servers');
    return [];
  }
  const servers = parsed.mcpServers ?? {};
  const tools: Array<ReturnType<typeof tool>> = [];
  for (const [serverName, cfg] of Object.entries(servers)) {
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
