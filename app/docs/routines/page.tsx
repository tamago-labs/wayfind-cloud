import type { Metadata } from 'next';
import Link from 'next/link';
import { Callout, H2, P } from '@/components/docs/ui';

export const metadata: Metadata = {
  title: 'Routines — Wayfind Docs',
  description: 'Scheduled work in Wayfind Cloud: create routines from chat, manage them per Bot.',
};

export default function DocsRoutinesPage() {
  return (
    <article>
      <h1 className="font-brico text-4xl font-extrabold tracking-tight text-navy sm:text-5xl">Routines</h1>
      <P>
        Routines are scheduled jobs owned by a Bot: a prompt plus a cadence. Tell a Bot what to do
        and when, and it runs on its own — “every weekday at 8:00, brief me on overnight support
        tickets” or “remind me Friday at 4pm to review expenses”.
      </P>

      <H2 id="create">Creating a routine</H2>
      <P>
        Entirely from chat, in plain language. Say what the job is and when it should run — once
        (“tomorrow at 9am”) or repeating (“every Monday”). Include your timezone if it matters;
        the Bot confirms the schedule before saving.
      </P>

      <H2 id="manage">Managing routines</H2>
      <P>
        Open the Bot&apos;s details panel to see its routines: each shows what it does, how often it
        runs, and when it ran last. Pause a routine any time without losing it, resume when
        you&apos;re ready, or delete it outright. A run already in flight still finishes after you
        delete — pausing first stops the next one cleanly.
      </P>
      <Callout>
        Routines belong to the Bot that created them, but the list flags other Bots&apos; routines
        instead of hiding them — so an empty-looking panel always explains itself.
      </Callout>

      <H2 id="approvals">Approvals still apply</H2>
      <P>
        A routine that wants to send, pay, publish, or change important records pauses for your OK,
        exactly like a chat job. Scheduling autonomy never bypasses your approval.
      </P>

      <H2 id="next">Where next</H2>
      <P>
        Routines run on your <Link href="/docs/computer" className="font-bold text-cta hover:underline">cloud computer</Link> —
        asleep between runs, awake when the schedule fires. Give them tools via{' '}
        <Link href="/docs/connectors" className="font-bold text-cta hover:underline">Connectors</Link>.
      </P>
    </article>
  );
}
