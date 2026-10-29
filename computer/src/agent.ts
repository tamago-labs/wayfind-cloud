// Triage agent (chat-further agents/triage.ts pattern): answers directly,
// fans out via handoffs in P1. Single model from env for P0.
import { Agent } from '@openai/agents';
import { PROVIDER_MODEL } from './config.js';
import { builtinTools } from './tools/builtin.js';

export function createTriageAgent(): InstanceType<typeof Agent> {
  return new Agent({
    name: 'Wayfind',
    model: PROVIDER_MODEL,
    instructions:
      'You are Wayfind, a teammate working on the user\'s cloud computer. ' +
      'You have a workspace with files, a shell, and skills. Do the task, ' +
      'show your work briefly, and ask before anything irreversible ' +
      '(sending, paying, deleting, publishing). Keep replies short.',
    tools: builtinTools,
  });
}
