// `question` tool (opencode-style): the model asks the user for input
// mid-run — options, preferences, missing details. Single-select v1:
// each question renders option buttons + Skip in the frontend.
//
// Delivery is hook-injected (no import cycle): the server hook pushes an
// SSE event and waits for POST /questions/:id (120s → "Unanswered",
// mirroring opencode's fallback). The CLI hook prompts on stdin.
// `needsApproval` is always false — asking the user IS the approval.
import { tool } from '@openai/agents';
import { z } from 'zod';
import { approvalPolicy, guarded, type GuardOpts } from '../../core/guard.js';

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface QuestionPrompt {
  question: string;
  header?: string;
  options: QuestionOption[];
}

export type AskHook = (questions: QuestionPrompt[]) => Promise<string[][]>;

const OptionSchema = z.object({
  label: z.string().describe('Button label (short, 1-5 words)'),
  description: z.string().optional().describe('What this choice means'),
});

const QuestionSchema = z.object({
  question: z.string().describe('Complete question to ask'),
  header: z.string().optional().describe('Very short label (max 30 chars)'),
  options: z.array(OptionSchema).describe('Choices (2-4). Always include a way to decline.'),
});

export function formatAnswers(questions: QuestionPrompt[], answers: string[][]): string {
  const formatted = questions
    .map((q, i) => `"${q.question}"="${answers[i]?.length ? answers[i].join(', ') : 'Unanswered'}"`)
    .join(', ');
  return `User has answered your questions: ${formatted}. You can now continue with the user's answers in mind.`;
}

export function createQuestionTool(opts: GuardOpts, ask: AskHook): ReturnType<typeof tool> {
  return tool({
    name: 'question',
    description:
      'Ask the user questions mid-run when you need a decision, preference, or missing detail. ' +
      'Use for genuine forks (which approach? which scope?) — not for facts you can look up. ' +
      'Keep to 1-3 questions, 2-4 options each, always with a decline/skip option.',
    parameters: z.object({
      questions: z.array(QuestionSchema).describe('Questions to ask (max 3)'),
    }),
    execute: guarded('question', () => 'ask-user', async (a: { questions: QuestionPrompt[] }) => {
      const list = a.questions.slice(0, 3).map((q) => ({
        question: q.question,
        header: q.header,
        options: q.options.slice(0, 4),
      }));
      const answers = await ask(list);
      return formatAnswers(list, answers);
    }, opts),
    // Inherently user-directed — never gated by permission rules.
    needsApproval: async () => false,
  });
}
