// Triage agent (chat-further agents/triage.ts pattern). Assembles the full
// toolset: guarded builtins + skill tool + MCP tools + task tool, handoff
// specialists, and the skill catalog in the prompt. Model is resolved per
// agent via the providers catalog (true per-agent providers, no globals).
import { Agent, webSearchTool } from '@openai/agents';
import type { GuardOpts } from '../core/guard.js';
import { loadMcpTools } from './mcp.js';
import { providerGrounding, resolveModel, type ResolvedModel } from '../providers/providers.js';
import { createEditTool } from './tools/edit.js';
import { createSearchTools } from './tools/search.js';
import { createWebTools, hasSearchKey } from './tools/web.js';
import { createSkillTool, createSkillImportTool, createSkillScanTool, filterSkills, loadSkills, skillCatalogPrompt, SKILL_IMPORT_GUIDANCE } from './skills.js';
import { check, loadRules } from '../core/permissions.js';
import { triageHandoffs } from './subagents.js';
import { createBuiltinTools } from './tools/builtin.js';
import { createQuestionTool, type AskHook } from './tools/question.js';
import { createTaskTool, type RunChild } from './tools/task.js';

const BASE_INSTRUCTIONS =
  'You are a teammate working on the user\'s cloud computer. ' +
  'Your name, role, and job for this conversation come from the bracketed context on each user turn — always identify as that name. ' +
  'You have a workspace with files, a shell, and skills. Do the task, ' +
  'show your work, and ask before anything irreversible ' +
  '(sending, paying, deleting, publishing). Match the user\'s energy: ' +
  'quick confirmations for simple chat, natural full replies otherwise — ' +
  'talk like a teammate, not a status line. ' +
  'You have built-in grounded web search for current or external facts — it runs automatically. ' +
  'Whenever you use it, end your answer with a \'Sources:\' markdown list of the URLs you relied on. ' +
  'Use the websearch tool only when you need an explicit result list with snippets. ' +
  'If the request needs no tools, answer immediately without calling any. ' +
  'Never explore the workspace unprompted — only read or list when the task requires it. ' +
  'For independent work streams, spawn parallel `task` subagents instead of doing everything serially.' +
  SKILL_IMPORT_GUIDANCE;

export interface AgentSelection {
  provider?: string;
  model?: string;
  /** Subagent variant: research agents get a read-only toolset. */
  variant?: 'full' | 'research';
}

/** Tools unavailable to read-only research subagents. */
const RESEARCH_DENY = new Set(['write', 'edit', 'shell', 'task', 'question', 'import_skill']);

/** Logged once per process so a boot line proves which code is live. */
let loggedTools = false;

export async function createTriageAgent(
  opts: GuardOpts,
  sel: AgentSelection = {},
  runChild?: RunChild,
  ask?: AskHook,
): Promise<InstanceType<typeof Agent>> {
  // Per-bot allowlist first, then the global kill switch: a deny rule on
  // skill:<name> hides it from every bot (Settings documents this).
  const skills = filterSkills(loadSkills(), opts.allowedSkills).filter(
    (s) => check(loadRules(), 'skill', s.name) !== 'deny',
  );
  const [mcpTools] = await Promise.all([loadMcpTools(opts)]);
  const resolved: ResolvedModel = resolveModel(sel.provider, sel.model);
  let tools = [...createBuiltinTools(opts), createEditTool(opts), ...createSearchTools(opts), createSkillTool(skills, opts), createSkillImportTool(opts), createSkillScanTool(), ...mcpTools, ...createWebTools(opts)];
  // Hosted grounded search (Meta web_search): provider-side, no extra key,
  // runs automatically when the model needs current/external facts.
  // No approval card — it has no local side effects.
  if (providerGrounding(resolved.providerId)) {
    tools.push(webSearchTool({ searchContextSize: 'medium' }) as never);
  }
  if (sel.variant === 'research') {
    tools = tools.filter((t) => !RESEARCH_DENY.has((t as { name: string }).name));
  }
  if (ask) tools.push(createQuestionTool(opts, ask));
  if (runChild) tools.push(createTaskTool(runChild, opts));
  const names = tools.map((t) => (t as { name: string }).name);
  if (!loggedTools) {
    loggedTools = true;
    console.log(`[agent] tools: ${names.join(', ')} (variant: ${sel.variant ?? 'full'}, search key: ${hasSearchKey() ? 'yes' : 'no'})`);
  } else if (process.env.WAYFIND_DEBUG_EVENTS === '1') {
    console.log(`[agent] tools: ${names.join(', ')} (search key: ${hasSearchKey() ? 'yes' : 'no'})`);
  }
  return new Agent({
    name: 'Wayfind',
    model: (await resolved.get()) as never,
    instructions: BASE_INSTRUCTIONS + skillCatalogPrompt(skills),
    tools,
    handoffs: await triageHandoffs(opts, sel),
  });
}
