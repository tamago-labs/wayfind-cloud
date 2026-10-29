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
  /** True when auto-allowed in permissive mode (v1 default) — audit only. */
  auto?: boolean;
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

/** v1 default: permissive — asks auto-allow and are logged for audit.
 * Set PERMISSION_MODE=enforcing to park on asks (requires a resume
 * transport that survives provider idle timeouts — not yet built). */
export function permissionMode(): 'permissive' | 'enforcing' {
  return process.env.PERMISSION_MODE === 'enforcing' ? 'enforcing' : 'permissive';
}

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
      if (permissionMode() === 'permissive') {
        // v1: audit only — log the ask and allow. Flip with
        // PERMISSION_MODE=enforcing (needs a hang-proof resume transport).
        opts.onApproval?.({ id: randomUUID(), permission, target, auto: true });
      } else if (opts.interactive) {
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
        throw new Error(`Needs approval (permissive mode is off and no resume channel): ${permission} "${target}"`);
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
