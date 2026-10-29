// Permissions, opencode Ruleset-lite: allow|deny|ask with wildcard patterns,
// loaded from workspace/permissions.json (defaults below). Two ask modes:
// - CLI (interactive): prompt on stdin (allow once / always / deny).
// - Server (non-interactive): emit an approval event on the run stream and
//   deny for now — pause/resume lands in P2.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { WORKSPACE_DIR } from './config.js';

export type Action = 'allow' | 'deny' | 'ask';
export interface Rule {
  permission: string;
  pattern: string;
  action: Action;
}

const DEFAULTS: Rule[] = [
  { permission: 'read', pattern: '*', action: 'allow' },
  { permission: 'list', pattern: '*', action: 'allow' },
  { permission: 'skill', pattern: '*', action: 'allow' },
  { permission: 'shell', pattern: 'ls *', action: 'allow' },
  { permission: 'shell', pattern: 'cat *', action: 'allow' },
  { permission: 'shell', pattern: 'echo *', action: 'allow' },
  { permission: 'shell', pattern: '*', action: 'ask' },
  { permission: 'write', pattern: '*', action: 'ask' },
];

function wildcard(pattern: string, value: string): boolean {
  const rx = new RegExp(`^${pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  return rx.test(value);
}

export function loadRules(): Rule[] {
  const path = join(WORKSPACE_DIR, 'permissions.json');
  if (!existsSync(path)) return DEFAULTS;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { rules?: Rule[] };
    return parsed.rules?.length ? parsed.rules : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function check(rules: Rule[], permission: string, target: string): Action {
  for (const r of rules) {
    if (r.permission === permission && wildcard(r.pattern, target)) return r.action;
  }
  return 'ask';
}

export async function askCli(permission: string, target: string): Promise<'allow' | 'deny' | 'always'> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question(`Allow ${permission} "${target}"? [y]es / [a]lways / [n]o: `, resolve);
  });
  rl.close();
  const a = answer.trim().toLowerCase();
  if (a === 'a' || a === 'always') return 'always';
  if (a === 'y' || a === 'yes' || a === '') return 'allow';
  return 'deny';
}
