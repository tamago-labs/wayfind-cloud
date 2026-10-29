// `wayfind` CLI: chat (REPL) | run (one-shot) | status | skills | keys.
// Usage (from computer/): npx tsx src/cli.ts chat
import { createInterface } from 'node:readline';
import { PORT, requireApiKey } from './config.js';
import { initProvider } from './provider.js';
import { createTriageAgent } from './agent.js';
import { maskedKeys, writeKey } from './keystore.js';
import { loadSkills } from './skills.js';
import { startRun } from './runner.js';
import { run } from '@openai/agents';

const AGENT_URL = process.env.AGENT_URL ?? `http://localhost:${PORT}`;

async function cmdStatus(): Promise<void> {
  const res = await fetch(`${AGENT_URL}/status`);
  console.log(JSON.stringify(await res.json(), null, 2));
}

async function cmdSkills(): Promise<void> {
  for (const s of loadSkills()) {
    console.log(`- ${s.name}: ${s.description}`);
  }
}

async function cmdKeys(args: string[]): Promise<void> {
  const [sub, name, ...rest] = args;
  if (sub === 'list' || sub === undefined) {
    console.log(JSON.stringify(maskedKeys(), null, 2));
    return;
  }
  if (sub === 'set' && name && rest.length > 0) {
    writeKey(name, rest.join(' '));
    console.log(`Saved ${name} to the keystore.`);
    return;
  }
  console.error('Usage: wayfind keys [list|set <NAME> <value>]');
  process.exit(1);
}

async function cmdRun(text: string): Promise<void> {
  requireApiKey();
  initProvider();
  const r = await startRun(text, { interactive: true });
  // Stream the local run's events to stdout.
  let cursor = 0;
  for (;;) {
    while (cursor < r.events.length) {
      const e = r.events[cursor];
      cursor += 1;
      if (e.type === 'chunk' && e.chunk) process.stdout.write(e.chunk);
      if (e.type === 'approval') console.log(`\n[approval requested: ${e.permission} "${e.target}"]`);
      if (e.type === 'error') console.error(`\n[error] ${e.error}`);
    }
    if (r.done) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  process.stdout.write('\n');
}

async function cmdChat(): Promise<void> {
  requireApiKey();
  initProvider();
  const agent = await createTriageAgent({ interactive: true });
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: 'you> ' });
  console.log(`Wayfind REPL (model via ${process.env.PROVIDER_BASE_URL ?? 'env'}). Empty line quits.`);
  const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  rl.prompt();
  for await (const line of rl) {
    const text = line.trim();
    if (!text) {
      rl.close();
      break;
    }
    const stream = await run(agent, [...history, { role: 'user', content: text }] as never, {
      stream: true,
      maxTurns: 20,
    });
    let full = '';
    for await (const event of stream as unknown as Iterable<{
      type: string;
      data?: { type: string; delta?: string };
    }>) {
      if (event.type === 'raw_model_stream_event' && event.data?.type === 'output_text_delta' && event.data.delta) {
        process.stdout.write(event.data.delta);
        full += event.data.delta;
      }
    }
    process.stdout.write('\n');
    history.push({ role: 'user', content: text }, { role: 'assistant', content: full });
    rl.prompt();
  }
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'status') return void (await cmdStatus());
  if (cmd === 'skills') return void (await cmdSkills());
  if (cmd === 'keys') return void (await cmdKeys(rest));
  if (cmd === 'run' && rest.length > 0) return void (await cmdRun(rest.join(' ')));
  if (cmd === 'chat' || cmd === undefined) return void (await cmdChat());
  console.error('Usage: wayfind [chat|run <text>|status|skills|keys [list|set]]');
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
