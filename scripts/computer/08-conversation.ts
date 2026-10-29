// 08 - conversations: per-bot transcript isolation + /history endpoint.
// Run: npx tsx scripts/computer/08-conversation.ts
import { AGENT_URL, assert, runToDone } from './config.js';

async function getHistory(conversationId: string): Promise<{ role: string; text: string }[]> {
  const res = await fetch(`${AGENT_URL}/history/${conversationId}`);
  if (!res.ok) throw new Error(`GET /history → ${res.status}`);
  const { messages } = (await res.json()) as { messages: { role: string; text: string }[] };
  return messages;
}

async function main(): Promise<void> {
  const stamp = Date.now().toString(36);
  const convA = `test-conv-a-${stamp}`;
  const convB = `test-conv-b-${stamp}`;

  // Interleaved turns in two conversations.
  const a1 = await runToDone('Reply with exactly: alpha-apple', 600_000, 3, { conversationId: convA });
  assert(a1.output.trim() === 'alpha-apple', `conv A first turn exact (got ${JSON.stringify(a1.output.trim())})`);
  const b1 = await runToDone('Reply with exactly: beta-berry', 600_000, 3, { conversationId: convB });
  assert(b1.output.trim() === 'beta-berry', `conv B first turn exact (got ${JSON.stringify(b1.output.trim())})`);

  // Memory check: A recalls its own word, not B's.
  const a2 = await runToDone('What word did you just say? Reply with only that word.', 600_000, 3, {
    conversationId: convA,
  });
  assert(a2.output.trim() === 'alpha-apple', `conv A recalls its own word (got ${JSON.stringify(a2.output.trim())})`);

  // History endpoint: each conversation contains only its own turns.
  const histA = await getHistory(convA);
  const textsA = histA.map((m) => m.text).join('\n');
  assert(textsA.includes('alpha-apple'), 'history A contains its own turns');
  assert(!textsA.includes('beta-berry'), 'history A has no bleed from B');
  const histB = await getHistory(convB);
  const textsB = histB.map((m) => m.text).join('\n');
  assert(textsB.includes('beta-berry'), 'history B contains its own turns');
  assert(!textsB.includes('alpha-apple'), 'history B has no bleed from A');

  // Name injection: the bot brief rides as bracketed user-turn context
  // (the model refuses system-assigned identity). Same stamp, new conversation.
  const convC = `test-conv-c-${stamp}`;
  const c1 = await runToDone('Reply with exactly: ready', 600_000, 3, {
    conversationId: convC,
    system: 'You are TestBot. Role: kitchen helper.',
  });
  assert(c1.output.trim() === 'ready', `name-brief turn exact (got ${JSON.stringify(c1.output.trim())})`);
  const c2 = await runToDone('What is your name? Reply with only the name.', 600_000, 3, {
    conversationId: convC,
    system: 'You are TestBot. Role: kitchen helper.',
  });
  assert(c2.output.trim() === 'TestBot', `bot knows its name (got ${JSON.stringify(c2.output.trim())})`);
  // Transcript stays clean: no bracketed brief persisted.
  const histC = await getHistory(convC);
  assert(
    histC.every((m) => !m.text.startsWith('[')),
    'history has no persisted brief prefix',
  );

  console.log('08-conversation: PASS');
}

main().catch((err) => {
  console.error('08-conversation: FAIL', err instanceof Error ? err.message : err);
  process.exit(1);
});
