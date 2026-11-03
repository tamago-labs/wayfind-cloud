import type { Metadata } from 'next';
import Link from 'next/link';
import { Callout, H2, P, Step, Steps } from '@/components/docs/ui';

export const metadata: Metadata = {
  title: 'Quickstart — Wayfind Docs',
  description: 'Five steps from signup to your first connected Bot in Wayfind Cloud.',
};

export default function DocsQuickstartPage() {
  return (
    <article>
      <h1 className="font-brico text-4xl font-extrabold tracking-tight text-navy sm:text-5xl">Quickstart</h1>
      <P>
        Five steps from signup to a Bot that works inside your business tools. Most people finish
        in under ten minutes — the longest step is creating your Zoho MCP server.
      </P>

      <Steps>
        <Step title="1">
          <strong>Start free.</strong> Head to <Link href="/app" className="font-bold text-cta hover:underline">the app</Link> and
          sign in. No credit card required — the Free plan covers up to 3 Bots with memory.
        </Step>
        <Step title="2">
          <strong>Meet Wayfind.</strong> Every new account starts with a Wayfind Bot — a chief of
          staff that already knows its way around. Say hello and ask what it can do.
        </Step>
        <Step title="3">
          <strong>Create your first Bot.</strong> Give it a name and a role, like “Aria — bookkeeping”
          or “Noah — support triage”. Bots remember your workflows, so be specific about the job.
        </Step>
        <Step title="4">
          <strong>Connect a tool.</strong> Click <strong>Connectors</strong> at the bottom of the
          sidebar, pick the app (Zoho CRM, Stripe, Outlook…), follow the setup guide, and paste
          your endpoint URL. Full walkthrough in{' '}
          <Link href="/docs/connectors" className="font-bold text-cta hover:underline">Connectors</Link>.
        </Step>
        <Step title="5">
          <strong>Hand off the first job.</strong> Ask the Bot to do something real — “reconcile
          last week&apos;s invoices” or “draft replies to unread support tickets”. It will work in
          the background and ask for approval before anything sensitive. Make it recurring and it
          becomes a <Link href="/docs/routines" className="font-bold text-cta hover:underline">routine</Link>.
        </Step>
      </Steps>

      <H2 id="approvals">Approvals keep you in charge</H2>
      <P>
        Bots run on their own but stop for your OK before sending, paying, publishing, or changing
        important records. You don&apos;t need to watch every step — just the ones that matter.
      </P>

      <Callout kind="tip">
        Connectors are shared across your whole team: import Zoho CRM once, and every Bot can use
        it immediately.
      </Callout>
    </article>
  );
}
