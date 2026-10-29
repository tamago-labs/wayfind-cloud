// `wayfind` CLI: chat (REPL), run (one-shot), status.
// Usage (from computer/): npx tsx src/cli.ts chat
import { createInterface } from 'node:readline';
import { PORT, requireApiKey } from './config.js';
import { initProvider } from './provider.js';
import { createTriageAgent } from './agent.js';
import { run } from '@openai/agents';

const AGENT_URL = process.env.AGENT_URL ?? `http://localhost:${PORT}`;

async function cmdStatus(): Promise<void> {
  const res = await fetch(`${AGENT_URL}/status`);
  console.log(JSON.stringify(await res.json(), null, 2));
}

async function cmdRun(text: string): Promise<void> {
  requireApiKey();
  initProvider();
  const stream = await run(createTriageAgent(), text, { stream: true, maxTurns: 20 });
  for await (const event of stream as unknown as Iterable<{
    type: string;
    data?: { type: string; delta?: string };
  }>) {
    if (event.type === 'raw_model_stream_event' && event.data?.type === 'output_text_delta' && event.data.delta) {
      process.stdout.write(event.data.delta);
    }
  }
  process.stdout.write('\n');
  const output = (stream as unknown as { finalOutput?: unknown }).finalOutput;
  if (typeof output === 'string' && output.length > 0) {
    // Deltas already printed; finalOutput is the assembled text.
  }
}

async function cmdChat(): Promise<void> {
  requireApiKey();
  initProvider();
  const agent = createTriageAgent();
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
  if (cmd === 'run' && rest.length > 0) return void (await cmdRun(rest.join(' ')));
  if (cmd === 'chat' || cmd === undefined) return void (await cmdChat());
  console.error('Usage: wayfind [chat|run <text>|status]');
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
