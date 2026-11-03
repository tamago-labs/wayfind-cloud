import type { Metadata } from 'next';
import { Callout, DocTable, H2, P } from '@/components/docs/ui';

export const metadata: Metadata = {
  title: 'Billing — Wayfind Docs',
  description: 'Wayfind Cloud billing: plans, credits, usage tracking, and the AI models behind your Bots.',
};

export default function DocsBillingPage() {
  return (
    <article>
      <h1 className="font-brico text-4xl font-extrabold tracking-tight text-navy sm:text-5xl">Billing</h1>
      <P>
        Free in early access, simple after. Every plan runs on Meta&apos;s open-weight AI models —
        Muse Spark Open on all plans, with Muse Wonder for complex and agentic work on Premium.
      </P>

      <H2 id="plans">Plans</H2>
      <DocTable
        head={['Plan', 'Price', 'What you get']}
        rows={[
          ['Free', '$0', 'Up to 3 Bots with memory. Watch ads to earn credits, then spend them on chats, images, and tools.'],
          ['Starter', '$5/mo', 'Up to 10 Bots with memory, generous usage limits — enough to hand off the busywork.'],
          ['Premium', '$30/mo', 'Unlimited Bots and group chats, Muse Wonder for browser work, highest usage limits.'],
        ]}
      />

      <H2 id="credits">Credits and usage</H2>
      <P>
        Paid activity spends credits: chats, images, and tool calls each draw from your balance.
        Watch your balance any time in the <strong>Usage</strong> panel under your profile menu —
        it breaks spend down by Bot, so you can see exactly where the work went.
      </P>
      <Callout kind="tip">
        On Free, credits come from watching ads — no credit card required, ever.
      </Callout>

      <H2 id="models">Which models do my Bots use?</H2>
      <P>
        Meta open-weight models (Muse Spark Open), served via Modal, on every plan. Premium adds
        Muse Wonder for browser work and heavier agentic tasks. You never pick models yourself —
        Wayfind routes each job to the right one.
      </P>
    </article>
  );
}
