import type { Metadata } from 'next';
import Link from 'next/link';
import { Callout, H2, P } from '@/components/docs/ui';

export const metadata: Metadata = {
  title: 'Introduction — Wayfind Docs',
  description: 'What Wayfind Cloud is: AI teammates for small businesses, Bots, a shared cloud computer, and connectors.',
};

export default function DocsIntroPage() {
  return (
    <article>
      <h1 className="font-brico text-4xl font-extrabold tracking-tight text-navy sm:text-5xl">Introduction</h1>
      <P>
        Wayfind Cloud gives your small business an AI team for finance, operations, marketing, and
        more. Instead of a chatbot that forgets everything, you get <strong>Bots</strong> — named
        teammates with memory that work inside your business tools and keep going in the cloud,
        even with your laptop closed.
      </P>

      <H2 id="mental-model">The mental model</H2>
      <P>Three pieces work together:</P>
      <ul className="mt-3 list-disc space-y-2 pl-6 text-navy/80">
        <li>
          <strong>Bots</strong> — the teammates. Each has a name, a role, and memory of your
          workflows. Chat with one, or let routines run on their own.
        </li>
        <li>
          <strong>One cloud computer</strong> — every account gets an isolated computer in the
          cloud, shared by all its Bots. It does the work: files, tools, and memory live there.
        </li>
        <li>
          <strong>Connectors</strong> — your business apps, plugged in once and usable by the
          whole team. Over 100 services arrive through Zoho MCP.
        </li>
      </ul>

      <H2 id="who-its-for">Who it&apos;s for</H2>
      <P>
        Small businesses that run on Zoho, Stripe, HubSpot, and the everyday tools of sales,
        support, finance, and scheduling — and want the busywork handled without hiring for it.
        No credit card is needed to start, and Wayfind is available worldwide from day one.
      </P>

      <Callout kind="tip">
        New here? The <Link href="/docs/quickstart" className="font-bold text-cta hover:underline">Quickstart</Link> takes
        you from signup to your first connected Bot in five steps.
      </Callout>

      <H2 id="what-bots-do">What Bots actually do</H2>
      <P>
        Bots complete multi-step work across your connected apps, remember your workflows, and
        keep going in the background. A Bot produces finished results — reconciliation reports,
        drafted emails, prepared announcements — and asks for your approval before anything
        sensitive, like sending, paying, or publishing.
      </P>

      <H2 id="next">Where next</H2>
      <ul className="mt-3 list-disc space-y-2 pl-6 text-navy/80">
        <li><Link href="/docs/quickstart" className="font-bold text-cta hover:underline">Quickstart</Link> — the five-step path to a working Bot.</li>
        <li><Link href="/docs/bots" className="font-bold text-cta hover:underline">Bots</Link> — roster, roles, and memory.</li>
        <li><Link href="/docs/routines" className="font-bold text-cta hover:underline">Routines</Link> — scheduled work that runs itself.</li>
        <li><Link href="/docs/computer" className="font-bold text-cta hover:underline">Cloud computer</Link> — where the work happens.</li>
        <li><Link href="/docs/connectors" className="font-bold text-cta hover:underline">Connectors</Link> — plug in your business apps.</li>
        <li><Link href="/docs/billing" className="font-bold text-cta hover:underline">Billing</Link> — plans, credits, and usage.</li>
      </ul>
    </article>
  );
}
