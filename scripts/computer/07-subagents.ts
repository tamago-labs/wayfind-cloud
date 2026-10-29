// 07 - subagents: verify the `task` tool (parallel fan-out, child-failure
// propagation, recursive delegation). Run: npx tsx scripts/computer/07-subagents.ts
import { assert, runToDone } from './config.js';

function toolCallsOf(events: { type: string; [k: string]: unknown }[]): number {
  const done = events.find((e) => e.type === 'done');
  return typeof done?.toolCalls === 'number' ? done.toolCalls : -1;
}

async function main(): Promise<void> {
  // 07a — fan-out: three independent reads must be delegated, not done inline.
  {
    const { output, events } = await runToDone(
      'Spawn one `task` subagent per file, all in parallel: read README.md, ' +
        'read package.json, read workspace/permissions.json. Then reply with ' +
        'exactly 3 short lines, one per file, each starting with the filename.',
    );
    const lines = output.split('\n').filter((l) => l.trim().length > 0);
    assert(lines.length >= 3, `fan-out answered per file (got ${lines.length} lines)`);
    for (const f of ['README.md', 'package.json', 'permissions.json']) {
      assert(output.includes(f), `fan-out output mentions ${f}`);
    }
    assert(toolCallsOf(events) >= 3, `parent ran >=3 tool calls (task spawns), got ${toolCallsOf(events)}`);
  }

  // 07b — child failure surfaces as a result, never crashes the parent run.
  {
    const { output } = await runToDone(
      'Use a `task` subagent to read the file /nonexistent-xyz-123/report.md and tell me what it contains.',
    );
    assert(
      /fail|could not|error|not found|no such|doesn.?t exist/i.test(output),
      `child failure reported in output (got ${JSON.stringify(output.slice(0, 120))})`,
    );
  }

  // 07c — recursive delegation still completes (the 4-deep cap itself is
  // code-verified in tools/task.ts; WAYFIND_DEBUG_EVENTS=1 shows the cap line).
  {
    const { output } = await runToDone(
      'Spawn a `task` subagent and instruct it to spawn its own `task` subagent ' +
        'to read README.md, then report back the first line. Reply with that line.',
    );
    assert(output.trim().length > 0, 'recursive delegation completed with an answer');
    console.log('note: depth cap (4) is code-verified; run server with WAYFIND_DEBUG_EVENTS=1 to watch it fire');
  }

  console.log('07-subagents: PASS');
}

main().catch((err) => {
  console.error('07-subagents: FAIL', err instanceof Error ? err.message : err);
  process.exit(1);
});
