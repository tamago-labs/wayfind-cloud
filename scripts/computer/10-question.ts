// 10 - question tool: the model asks the user mid-run via the question
// tool; the harness answers through POST /questions/:id and the run must
// continue with the answer. 120s tool-side timeout → "Unanswered".
// Run: npx tsx scripts/computer/10-question.ts
import { AGENT_URL, assert, collectStream, postTask, type SseEvent } from './config.js';

async function pendingFor(runId: string): Promise<Array<{ id: string }>> {
  const list = (await (await fetch(`${AGENT_URL}/questions`)).json()) as {
    questions: Array<{ id: string; runId: string }>;
  };
  return list.questions.filter((q) => q.runId === runId);
}

async function main(): Promise<void> {
  const stamp = Date.now().toString(36);
  const runId = await postTask(
    'Before answering, use the question tool to ask me whether I prefer cats or dogs ' +
      '(one question, two options), then reply with exactly: CHOSEN:<my choice in lowercase>.',
    { conversationId: `test-q-${stamp}` },
  );
  const promise = collectStream(runId, 600_000);
  const deadline = Date.now() + 240_000;
  let answered = false;
  while (Date.now() < deadline) {
    const [q] = await pendingFor(runId);
    if (q) {
      const res = await fetch(`${AGENT_URL}/questions/${q.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: [['dogs']] }),
      });
      assert(res.ok, `POST /questions/${q.id} answer → 200`);
      answered = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  assert(answered, 'question tool parked with a question event');
  const events: SseEvent[] = await promise;
  assert(events.some((e) => e.type === 'question'), 'stream carried a question event');
  assert(events.some((e) => e.type === 'done'), 'run resumed to done after the answer');
  const done = events.find((e) => e.type === 'done');
  assert(/CHOSEN:dogs/i.test(String(done?.output ?? '')), `answer flowed back into the run (got ${JSON.stringify(String(done?.output ?? '').slice(0, 120))})`);
  console.log('10-question: PASS');
}

main().catch((err) => {
  console.error('10-question: FAIL', err instanceof Error ? err.message : err);
  process.exit(1);
});
