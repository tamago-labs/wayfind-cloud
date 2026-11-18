// `update_bot` tool: a team lead proposes edits to one of its own team
// members and the user confirms on a card before anything changes.
//
// Same hook-injected delivery as `create_bot`: the server hook pushes a
// `bot_request` SSE event (kind 'update') and waits for POST
// /bot-requests/:id (120s → cancelled). The frontend owns Bot records —
// the tool only carries the proposal; applying + result reporting happen
// there, including the same-team check (leads can only edit their own
// team). `needsApproval` is always false — the confirm card IS the
// checkpoint.
import { tool } from '@openai/agents';
import { z } from 'zod';
import { check, loadRules } from '../../core/permissions.js';

export interface BotUpdateRequest {
  kind: 'update';
  /** Member bot name, exactly as listed in the team roster. */
  target: string;
  name?: string;
  role?: string;
  description?: string;
}

export interface BotUpdateResult {
  decision: 'confirm' | 'cancel';
  error?: string;
}

export type BotUpdateHook = (req: BotUpdateRequest) => Promise<BotUpdateResult>;

export function createBotUpdateTool(hook: BotUpdateHook): ReturnType<typeof tool> {
  return tool({
    name: 'update_bot',
    description:
      'Propose edits to one of YOUR OWN team members (rename, re-role, or rewrite their job brief). ' +
      'The user sees a confirmation card — nothing changes until they confirm. ' +
      'Only bots in your team roster can be updated; never propose edits to bots on other teams. ' +
      'Send only the fields that should change.',
    parameters: z.object({
      target: z.string().describe('Member bot name exactly as listed (without the @)'),
      name: z.string().optional().describe('New name, one short word'),
      role: z.string().optional().describe('New short role label'),
      description: z.string().optional().describe('New one-line job description'),
    }),
    // No guarded() wrapper: the confirm card is the checkpoint (same
    // reasoning as create_bot/question). An explicit deny rule is honored.
    execute: async (a: { target: string; name?: string; role?: string; description?: string }) => {
      if (check(loadRules(), 'update_bot', a.target) === 'deny') {
        throw new Error(`Denied by policy: update_bot "${a.target}"`);
      }
      const target = a.target.trim();
      if (!target) throw new Error('update_bot needs a target bot name.');
      const changes = {
        ...(a.name?.trim() ? { name: a.name.trim().slice(0, 40) } : {}),
        ...(a.role?.trim() ? { role: a.role.trim().slice(0, 80) } : {}),
        ...(a.description?.trim() ? { description: a.description.trim().slice(0, 200) } : {}),
      };
      if (Object.keys(changes).length === 0) throw new Error('update_bot needs at least one change (name, role, or description).');
      const res = await hook({ kind: 'update', target, ...changes });
      if (res.decision === 'confirm') {
        return `Bot "${target}" updated. Tell the user what changed.`;
      }
      if (res.error) {
        return `Bot update did not complete: ${res.error}. Adjust and call update_bot again, or tell the user.`;
      }
      return 'The user declined the bot update. Tell the user nothing was changed.';
    },
    // Inherently user-directed — never gated by permission rules.
    needsApproval: async () => false,
  });
}
