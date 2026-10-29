// 09 - web tools: webfetch fetches a page keyless; websearch needs an
// EXA_API_KEY (env or keystore) and answers from live results, otherwise it
// must say so gracefully instead of failing.
// Run: npx tsx scripts/computer/09-search.ts
import { AGENT_URL, assert, runToDone } from './config.js';

async function main(): Promise<void> {
  const status = (await (await fetch(`${AGENT_URL}/status`)).json()) as { search?: boolean };

  // webfetch: keyless page fetch → markdown.
  {
    const { output } = await runToDone(
      'Fetch https://example.com and reply with the first heading you find.',
    );
    assert(/example domain/i.test(output), `webfetch returned the page (got ${JSON.stringify(output.slice(0, 100))})`);
  }

  if (!status.search) {
    // No Exa key: the agent must either say a key is missing or get the
    // answer another way (e.g. webfetch) — but not fail.
    const { output } = await runToDone('What is the current latest stable TypeScript version?');
    assert(
      /exa|api key|\d+\.\d+/i.test(output),
      `websearch without key degrades gracefully (got ${JSON.stringify(output.slice(0, 120))})`,
    );
    console.log('09-search: PASS (fetch ok, search key absent — graceful path)');
    return;
  }

  // Key present: live answer.
  {
    const { output } = await runToDone(
      'Use web search to find the current latest stable TypeScript version. Reply with only the version number.',
    );
    assert(/\d+\.\d+/.test(output.trim()), `search answered with a version (got ${JSON.stringify(output.trim().slice(0, 80))})`);
  }
  console.log('09-search: PASS');
}

main().catch((err) => {
  console.error('09-search: FAIL', err instanceof Error ? err.message : err);
  process.exit(1);
});
