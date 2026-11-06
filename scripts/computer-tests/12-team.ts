// 12 - team messaging: member thread with a chief-only roster can message
// the chief (relay comes back), and self/bounce messages are refused by the
// delegation guard instead of ping-ponging. Needs a running server + real key
// (each step spends a few small model calls).
// Run: npx tsx scripts/computer-tests/12-team.ts
import { assert, runToDone } from './config.js';

async function main(): Promise<void> {
  // Member -> chief: roster of one, relay the reply verbatim.
  const relay = await runToDone(
    'Send a message to @Chief saying exactly "pineapple-seven" and relay the reply back to me word for word.',
    600_000,
    3,
    {
      conversationId: 'test-team-member',
      botName: 'Member',
      roster: [{ id: 'test-team-chief', name: 'Chief', role: 'Chief of staff' }],
    },
  );
  assert(/pineapple-seven/i.test(relay.output), `member run relayed the chief's reply (got ${JSON.stringify(relay.output.slice(0, 200))})`);

  // Bounce guard: messaging yourself is refused, not looped.
  const solo = await runToDone(
    'Send a message to @Solo saying hi.',
    600_000,
    3,
    {
      conversationId: 'test-team-solo',
      botName: 'Solo',
      roster: [{ id: 'test-team-solo', name: 'Solo' }],
    },
  );
  assert(/already consulted|up the chain|avoid a loop/i.test(solo.output), `self-message refused by delegation guard (got ${JSON.stringify(solo.output.slice(0, 200))})`);

  console.log('12-team: PASS');
}

main().catch((err) => {
  console.error('12-team: FAIL', err instanceof Error ? err.message : err);
  process.exit(1);
});
