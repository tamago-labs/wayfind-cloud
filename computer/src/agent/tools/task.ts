// `task` tool (opencode pattern): spawns a linked child run and returns its
// result as <task_result>. When the model emits several task calls in one
// step they execute concurrently — that is the parallel fan-out.
import { tool } from '@openai/agents';
import { z } from 'zod';
import { guarded, type GuardOpts } from '../../core/guard.js';

export type RunChild = (text: string) => Promise<string>;

export function createTaskTool(runChild: RunChild, opts: GuardOpts): ReturnType<typeof tool> {
  return tool({
    name: 'task',
    description:
      'Spawn a subagent for an independent work stream and wait for its result. ' +
      'Use for parallel lanes (research, setup, build) instead of serial work. ' +
      'Returns <task_result>…</task_result>.',
    parameters: z.object({
      description: z.string().describe('Short lane label, e.g. "research auth options"'),
      prompt: z.string().describe('Full instructions for the subagent'),
    }),
    execute: guarded('task', (a: { description: string }) => a.description, async (a: { description: string; prompt: string }) => {
      const output = await runChild(`[${a.description}] ${a.prompt}`);
      return `<task_result>\n${output}\n</task_result>`;
    }, opts),
  });
}
