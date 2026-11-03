import type { Metadata } from 'next';
import Link from 'next/link';
import { Callout, DocTable, H2, P } from '@/components/docs/ui';

export const metadata: Metadata = {
  title: 'Models — Wayfind Docs',
  description: 'The Meta AI models behind Wayfind Cloud: Muse Spark chat, Muse Image, and Muse Voice transcription.',
};

export default function DocsModelsPage() {
  return (
    <article>
      <h1 className="font-brico text-4xl font-extrabold tracking-tight text-navy sm:text-5xl">Models</h1>
      <P>
        Wayfind runs on Meta&apos;s AI models — one for chatting, one for images, one for voice.
        You never pick models or paste API keys; Wayfind routes each job to the right one and the
        spend lands in your usage.
      </P>

      <DocTable
        head={['Job', 'Model', 'What it does']}
        rows={[
          ['Chat', 'Muse Spark Open', 'Every conversation, tool call, and routine on all plans.'],
          ['Fresh facts', 'Muse Spark + web grounding', 'Bots search the web and answer with cited sources.'],
          ['Images', 'Muse Image (muse-image-1.0)', 'Generate and edit images from a text instruction.'],
          ['Voice', 'Muse Voice Transcribe', 'The mic button in chat turns speech into the job.'],
        ]}
      />

      <H2 id="chat">Chat</H2>
      <P>
        Muse Spark Open serves every conversation on all plans; Premium adds Muse Wonder for browser
        work and heavier agentic tasks. You describe the outcome — the routing is Wayfind&apos;s job.
        See <Link href="/docs/billing" className="font-bold text-cta hover:underline">Billing</Link> for
        how chat spend works.
      </P>

      <H2 id="images">Image generation</H2>
      <P>
        Ask any Bot to generate or edit an image — “a hero banner for the spring sale” or, of an
        existing image, “make it night”. Muse Image renders it, the picture lands inline in chat and
        in the workspace <span className="font-mono text-sm">generated/</span> folder. Flat $0.01
        per image, billed only on success.
      </P>

      <H2 id="voice">Voice</H2>
      <P>
        Tap the mic button in chat and speak the job instead of typing it. Muse Voice transcribes
        the recording and the Bot carries on as if you&apos;d written it.
      </P>

      <H2 id="grounding">Grounded search</H2>
      <P>
        When a Bot needs facts fresher than training data — prices, docs, today&apos;s news — it
        searches the web through Muse Spark and answers with a Sources list, so you can verify
        anything that matters.
      </P>

      <Callout kind="tip">
        No keys, nothing to configure. Chat, image, voice, and grounding all run on Wayfind&apos;s
        side — unlike connectors, where you bring your own endpoint URL (see{' '}
        <Link href="/docs/connectors" className="font-bold text-cta hover:underline">Connectors</Link>).
      </Callout>

      <H2 id="learn-more">Learn more</H2>
      <ul className="mt-3 list-disc space-y-2 pl-6 text-navy/80">
        <li>
          <a href="https://dev.meta.ai/models/muse-spark" target="_blank" rel="noopener noreferrer" className="font-bold text-cta hover:underline">
            Muse Spark
          </a>{' '}
          — chat and reasoning.
        </li>
        <li>
          <a href="https://dev.meta.ai/models/muse-image" target="_blank" rel="noopener noreferrer" className="font-bold text-cta hover:underline">
            Muse Image
          </a>{' '}
          — generation and editing.
        </li>
        <li>
          <a href="https://dev.meta.ai/models/muse-voice-transcribe" target="_blank" rel="noopener noreferrer" className="font-bold text-cta hover:underline">
            Muse Voice Transcribe
          </a>{' '}
          — speech to text.
        </li>
      </ul>
    </article>
  );
}
