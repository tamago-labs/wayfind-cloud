// Specialist sub-agents (chat-further handoffs pattern). The triage agent
// hands off; each specialist runs with a narrower toolset and reports back.
// True parallel fan-out (Promise.all over runs) lands in P2.
import { Agent } from '@openai/agents';
import { PROVIDER_MODEL } from './config.js';
import type { GuardOpts } from './guard.js';
import { createBuiltinTools } from './tools/builtin.js';

export function createResearchAgent(opts: GuardOpts): InstanceType<typeof Agent> {
  const [read, list, shell] = createBuiltinTools(opts).filter((t) =>
    ['read', 'list', 'shell'].includes((t as { name: string }).name),
  );
  return new Agent({
    name: 'Research',
    model: PROVIDER_MODEL,
    instructions:
      'You are a research specialist. Gather facts from files and the shell, ' +
      'summarize findings crisply with sources (file paths, commands run). ' +
      'You cannot write files — report back so the lead agent can act.',
    tools: [read, list, shell].filter(Boolean),
  });
}

export function createMcpSetupAgent(opts: GuardOpts): InstanceType<typeof Agent> {
  return new Agent({
    name: 'McpSetup',
    model: PROVIDER_MODEL,
    instructions:
      'You are an MCP setup specialist. Install and configure MCP servers: ' +
      'inspect workspace/mcp.json, add server entries, verify with list. ' +
      'Never write secrets into chat — put them in the keystore via the skill tool flow.',
    tools: createBuiltinTools(opts),
  });
}

export function triageHandoffs(opts: GuardOpts): Array<InstanceType<typeof Agent>> {
  return [createResearchAgent(opts), createMcpSetupAgent(opts)];
}
