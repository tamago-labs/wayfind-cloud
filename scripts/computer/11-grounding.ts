// 11 - grounded search: direct Meta Responses API probe (not an agent run).
// Posts to https://api.meta.ai/v1/responses with the web_search tool and
// asserts the model searched and cited sources. Agent chat itself runs on
// the Modal endpoint; grounded_search calls this same Meta path server-side.
// Run from repo root: npx tsx scripts/computer/11-grounding.ts
import { config } from 'dotenv';
import { assert } from './config.js';

config({ path: 'computer/.env' });

const META_RESPONSES_URL = 'https://api.meta.ai/v1/responses';

async function main(): Promise<void> {
  const key = process.env.PROVIDER_API_KEY;
  assert(!!key, 'PROVIDER_API_KEY (Meta) is set in computer/.env');
  const res = await fetch(META_RESPONSES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'muse-spark-1.3',
      input:
        'Who won the most recent Formula 1 Grand Prix? Two sentences max.\n\nEnd your answer with a \'Sources:\' markdown list of the URLs you relied on.',
      tools: [{ type: 'web_search' }],
    }),
  });
  assert(res.ok, `Meta responses HTTP ${res.status}`);
  const data = (await res.json()) as {
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string; annotations?: Array<{ type?: string; url?: string; title?: string }> }> }>;
    error?: { message?: string };
  };
  assert(!data.error, `no API error (got: ${data.error?.message ?? 'none'})`);
  const output = data.output ?? [];
  assert(
    output.some((i) => i.type === 'web_search_call'),
    'model performed a web_search_call',
  );
  const texts: string[] = [];
  for (const item of output) {
    if (item.type !== 'message') continue;
    for (const block of item.content ?? []) {
      if (block.type === 'output_text' && block.text) texts.push(block.text);
    }
  }
  const text = texts.join('\n').trim();
  console.log(`--- grounded answer ---\n${text}\n--- end ---`);
  assert(text.length > 0, 'grounded answer is non-empty');
  assert(/sources:/i.test(text), 'answer ends with a Sources list');
  assert(/https?:\/\//.test(text), 'Sources list contains at least one URL');
  console.log('11-grounding: PASS');
}

main().catch((err) => {
  console.error('11-grounding: FAIL', err instanceof Error ? err.message : err);
  process.exit(1);
});
