// MCP client (stdio only, P1): reads workspace/mcp.json, spawns each
// configured server, converts its tools to agent tools. Remote/streamable
// transports land in P2.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { tool } from '@openai/agents';
import { WORKSPACE_DIR } from './config.js';
import { guarded, type GuardOpts } from './guard.js';

interface McpServerConfig {
  command: string[];
  environment?: Record<string, string>;
}

interface McpJson {
  mcpServers?: Record<string, McpServerConfig>;
}

function sanitize(s: string): string {
  return s.replace(/[^A-Za-z0-9_.-]/g, '_');
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
    if (!cfg?.command?.length) {
      console.error(`MCP server "${serverName}" has no command — skipping`);
      continue;
    }
    try {
      const transport = new StdioClientTransport({
        command: cfg.command[0],
        args: cfg.command.slice(1),
        env: { ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined) as [string, string][]), ...(cfg.environment ?? {}) },
      });
      const client = new Client({ name: 'wayfind-computer', version: '0.1.0' });
      await client.connect(transport);
      const listed = await client.listTools();
      for (const t of listed.tools) {
        const toolName = `${sanitize(serverName)}_${sanitize(t.name)}`;
        tools.push(
          tool({
            name: toolName,
            description: t.description ?? `MCP tool ${t.name} from ${serverName}`,
            // MCP inputSchema is already JSON Schema — pass it through.
            parameters: {
              type: 'object',
              properties: ((t.inputSchema as Record<string, unknown> | undefined)?.properties ??
                {}) as Record<string, unknown>,
              required: [],
              additionalProperties: true,
            },
            strict: false,
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
