// Triage agent (chat-further agents/triage.ts pattern). Assembles the full
// P1 toolset: guarded builtins + skill tool + MCP tools, handoff
// specialists, and the skill catalog in the prompt.
import { Agent } from '@openai/agents';
import { PROVIDER_MODEL } from './config.js';
import type { GuardOpts } from './guard.js';
import { loadMcpTools } from './mcp.js';
import { createSkillTool, loadSkills, skillCatalogPrompt } from './skills.js';
import { triageHandoffs } from './subagents.js';
import { createBuiltinTools } from './tools/builtin.js';

const BASE_INSTRUCTIONS =
  'You are Wayfind, a teammate working on the user\'s cloud computer. ' +
  'You have a workspace with files, a shell, and skills. Do the task, ' +
  'show your work briefly, and ask before anything irreversible ' +
  '(sending, paying, deleting, publishing). Keep replies short.';

export async function createTriageAgent(opts: GuardOpts): Promise<InstanceType<typeof Agent>> {
  const skills = loadSkills();
  const [mcpTools] = await Promise.all([loadMcpTools(opts)]);
  const skillTool = createSkillTool(skills, opts);
  return new Agent({
    name: 'Wayfind',
    model: PROVIDER_MODEL,
    instructions: BASE_INSTRUCTIONS + skillCatalogPrompt(skills),
    tools: [...createBuiltinTools(opts), skillTool, ...mcpTools],
    handoffs: triageHandoffs(opts),
  });
}
