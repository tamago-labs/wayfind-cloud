// Shared tool guard: permission check (allow/deny/ask) + doom-loop guard
// (3x identical tool+target in one run → stop). Runs in an
// AsyncLocalStorage context so concurrent server runs stay isolated.
import { AsyncLocalStorage } from 'node:async_hooks';
import { askCli, check, loadRules, type Action, type Rule } from './permissions.js';

import { randomUUID } from 'node:crypto';

export interface ApprovalRequest {
  id: string;
  permission: string;
  target: string;
}

export interface GuardOpts {
  interactive: boolean;
  onApproval?: (approval: ApprovalRequest) => void;
  /** Server mode: park until the frontend decides (timeout → reject). */
  waitForDecision?: (approval: ApprovalRequest) => Promise<'approve' | 'reject'>;
  alwaysAllow?: { permission: string; pattern: string }[];
}

const runStore = new AsyncLocalStorage<string>();
const callLogs = new Map<string, Array<{ tool: string; target: string }>>();
const sessionAllows: Array<{ permission: string; pattern: string }> = [];

function wildcard(pattern: string, value: string): boolean {
  const rx = new RegExp(`^${pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  return rx.test(value);
}

function decide(rules: Rule[], permission: string, target: string): Action {
  for (const a of sessionAllows) {
    if (a.permission === permission && wildcard(a.pattern, target)) return 'allow';
  }
  return check(rules, permission, target);
}

export function runWithContext<T>(runId: string, fn: () => T): T {
  return runStore.run(runId, fn);
}

/** Wrap a tool execute with permission + doom-loop checks. */
export function guarded<TArgs, TResult>(
  permission: string,
  targetOf: (args: TArgs) => string,
  execute: (args: TArgs) => Promise<TResult>,
  opts: GuardOpts,
): (args: TArgs) => Promise<TResult> {
  const rules = loadRules();
  return async (args: TArgs) => {
    const target = targetOf(args);
    const action = decide(rules, permission, target);
    if (action === 'deny') {
      throw new Error(`Denied by policy: ${permission} "${target}"`);
    }
    if (action === 'ask') {
      if (opts.interactive) {
        const answer = await askCli(permission, target);
        if (answer === 'deny') throw new Error(`Denied by user: ${permission} "${target}"`);
        if (answer === 'always') sessionAllows.push({ permission, pattern: target });
      } else if (opts.waitForDecision) {
        const approval: ApprovalRequest = { id: randomUUID(), permission, target };
        opts.onApproval?.(approval);
        const decision = await opts.waitForDecision(approval);
        if (decision !== 'approve') throw new Error(`Rejected: ${permission} "${target}"`);
      } else {
        opts.onApproval?.({ id: randomUUID(), permission, target });
        throw new Error(`Needs approval — denied for now (pause/resume lands in P2): ${permission} "${target}"`);
      }
    }
    const runId = runStore.getStore() ?? 'cli';
    const log = callLogs.get(runId) ?? [];
    log.push({ tool: permission, target });
    callLogs.set(runId, log);
    const last3 = log.slice(-3);
    if (last3.length === 3 && last3.every((c) => c.tool === permission && c.target === target)) {
      throw new Error(`Doom-loop guard: ${permission} "${target}" called 3x identically — stopping.`);
    }
    return execute(args);
  };
}

export function clearRunLog(runId: string): void {
  callLogs.delete(runId);
}

export function toolCallCount(runId: string): number {
  return callLogs.get(runId)?.length ?? 0;
}
