// Triage agent (chat-further agents/triage.ts pattern). Assembles the full
// toolset: guarded builtins + skill tool + MCP tools + task tool, handoff
// specialists, and the skill catalog in the prompt. Model is resolved per
// agent via the providers catalog (true per-agent providers, no globals).
import { Agent } from '@openai/agents';
import type { GuardOpts } from '../core/guard.js';
import { loadMcpTools } from './mcp.js';
import { resolveModel, type ResolvedModel } from '../providers/providers.js';
import { createEditTool } from './tools/edit.js';
import { createSearchTools } from './tools/search.js';
import { createWebTools, hasSearchKey } from './tools/web.js';
import { createSkillTool, loadSkills, skillCatalogPrompt } from './skills.js';
import { triageHandoffs } from './subagents.js';
import { createBuiltinTools } from './tools/builtin.js';
import { createQuestionTool, type AskHook } from './tools/question.js';
import { createTaskTool, type RunChild } from './tools/task.js';

const BASE_INSTRUCTIONS =
  'You are a teammate working on the user\'s cloud computer. ' +
  'Your name, role, and job for this conversation come from the bracketed context on each user turn — always identify as that name. ' +
  'You have a workspace with files, a shell, and skills. Do the task, ' +
  'show your work briefly, and ask before anything irreversible ' +
  '(sending, paying, deleting, publishing). Keep replies short. ' +
  'If the request needs no tools, answer immediately without calling any. ' +
  'Never explore the workspace unprompted — only read or list when the task requires it. ' +
  'For independent work streams, spawn parallel `task` subagents instead of doing everything serially.';

export interface AgentSelection {
  provider?: string;
  model?: string;
  /** Subagent variant: research agents get a read-only toolset. */
  variant?: 'full' | 'research';
}

/** Tools unavailable to read-only research subagents. */
const RESEARCH_DENY = new Set(['write', 'edit', 'shell', 'task', 'question']);

export async function createTriageAgent(
  opts: GuardOpts,
  sel: AgentSelection = {},
  runChild?: RunChild,
  ask?: AskHook,
): Promise<InstanceType<typeof Agent>> {
  const skills = loadSkills();
  const [mcpTools] = await Promise.all([loadMcpTools(opts)]);
  const resolved: ResolvedModel = resolveModel(sel.provider, sel.model);
  let tools = [...createBuiltinTools(opts), createEditTool(opts), ...createSearchTools(opts), createSkillTool(skills, opts), ...mcpTools, ...createWebTools(opts)];
  if (sel.variant === 'research') {
    tools = tools.filter((t) => !RESEARCH_DENY.has((t as { name: string }).name));
  }
  if (ask) tools.push(createQuestionTool(opts, ask));
  if (runChild) tools.push(createTaskTool(runChild, opts));
  if (process.env.WAYFIND_DEBUG_EVENTS === '1') {
    console.log(`[agent] tools: ${tools.map((t) => (t as { name: string }).name).join(', ')} (search key: ${hasSearchKey() ? 'yes' : 'no'})`);
  }
  if (runChild) tools.push(createTaskTool(runChild, opts));
  return new Agent({
    name: 'Wayfind',
    model: (await resolved.get()) as never,
    instructions: BASE_INSTRUCTIONS + skillCatalogPrompt(skills),
    tools,
    handoffs: await triageHandoffs(opts, sel),
  });
}
