// Triage agent (chat-further agents/triage.ts pattern). Assembles the full
// toolset: guarded builtins + skill tool + MCP tools + task tool, handoff
// specialists, and the skill catalog in the prompt. Model is resolved per
// agent via the providers catalog (true per-agent providers, no globals).
import { Agent } from '@openai/agents';
import type { GuardOpts } from './guard.js';
import { loadMcpTools } from './mcp.js';
import { resolveModel, type ResolvedModel } from './providers.js';
import { createSkillTool, loadSkills, skillCatalogPrompt } from './skills.js';
import { triageHandoffs } from './subagents.js';
import { createBuiltinTools } from './tools/builtin.js';
import { createTaskTool, type RunChild } from './tools/task.js';

const BASE_INSTRUCTIONS =
  'You are Wayfind, a teammate working on the user\'s cloud computer. ' +
  'You have a workspace with files, a shell, and skills. Do the task, ' +
  'show your work briefly, and ask before anything irreversible ' +
  '(sending, paying, deleting, publishing). Keep replies short. ' +
  'For independent work streams, spawn parallel `task` subagents instead of doing everything serially.';

export interface AgentSelection {
  provider?: string;
  model?: string;
}

export async function createTriageAgent(
  opts: GuardOpts,
  sel: AgentSelection = {},
  runChild?: RunChild,
): Promise<InstanceType<typeof Agent>> {
  const skills = loadSkills();
  const [mcpTools] = await Promise.all([loadMcpTools(opts)]);
  const resolved: ResolvedModel = resolveModel(sel.provider, sel.model);
  const tools = [...createBuiltinTools(opts), createSkillTool(skills, opts), ...mcpTools];
  if (runChild) tools.push(createTaskTool(runChild, opts));
  return new Agent({
    name: 'Wayfind',
    model: (await resolved.get()) as never,
    instructions: BASE_INSTRUCTIONS + skillCatalogPrompt(skills),
    tools,
    handoffs: await triageHandoffs(opts, sel),
  });
}
