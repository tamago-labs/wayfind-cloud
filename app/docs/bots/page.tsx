import type { Metadata } from 'next';
import Link from 'next/link';
import { Callout, H2, H3, P } from '@/components/docs/ui';

export const metadata: Metadata = {
  title: 'Bots — Wayfind Docs',
  description: 'Bots in Wayfind Cloud: roster, roles, memory, and how conversations work.',
};

export default function DocsBotsPage() {
  return (
    <article>
      <h1 className="font-brico text-4xl font-extrabold tracking-tight text-navy sm:text-5xl">Bots</h1>
      <P>
        Bots are the teammates. Each one has a name, a role, and memory — chat with them in the
        roster, hand off jobs, and come back to finished results.
      </P>

      <H2 id="roster">The roster</H2>
      <P>
        The left sidebar lists every Bot on your team. Selecting one opens its conversation; unread
        work and pending approvals surface there. Your first Bot, <strong>Wayfind</strong>, is a
        chief of staff seeded automatically — a good default for anything you haven&apos;t assigned yet.
      </P>

      <H2 id="creating">Creating a Bot</H2>
      <P>
        Create a Bot with a name and a role that describes its job — “Aria, bookkeeping” beats
        “Assistant”, because the role shapes how it works and what it remembers. Pick a color and
        shape so you can spot it at a glance.
      </P>
      <Callout kind="tip">
        One Bot per job works best. A bookkeeping Bot and a support Bot stay sharper than one
        generalist trying to do both.
      </Callout>

      <H2 id="memory">Memory</H2>
      <P>
        Bots remember your workflows across conversations: how you like invoices reconciled, which
        mailbox is support, what “the weekly report” means. Corrections stick — tell a Bot once
        and it applies from then on.
      </P>

      <H2 id="conversations">Conversations</H2>
      <P>
        Every Bot keeps its own conversation history. Ask follow-ups in the same thread and the Bot
        keeps context; start fresh any time. Long-running work continues in the background on your
        cloud computer — close the laptop, come back to the result.
      </P>

      <H3 id="background-work">Background work</H3>
      <P>
        Bots can run routines on their own and check in when they need you. Anything sensitive —
        sending, paying, publishing, changing important records — pauses for your approval first.
        See <Link href="/docs/computer" className="font-bold text-cta hover:underline">Cloud computer</Link> for
        where this work runs.
      </P>
    </article>
  );
}
