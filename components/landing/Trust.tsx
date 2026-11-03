import Link from 'next/link';
import { Check, KeyRound, ShieldCheck, ScrollText } from 'lucide-react';

const cats: { n: string; items: string[] }[] = [
  { n: 'Finance', items: ['Zoho Books', 'FreshBooks', 'Stripe'] },
  { n: 'Sales', items: ['Zoho CRM', 'HubSpot CRM', 'Shopify'] },
  { n: 'Operations', items: ['Zoho Mail', 'Outlook', 'Mailchimp'] },
  { n: 'Development', items: ['GitHub', 'GitLab', 'Notion'] },
  { n: 'Web3', items: ['USDC', 'xStocks', 'Solana'] },
];

const trust = [
  { icon: Check, text: 'Every sensitive action checked with you first' },
  { icon: KeyRound, text: 'Keys connect at the backend; they never appear in Bot conversations' },
  { icon: ShieldCheck, text: 'Each account gets a private computer nobody else can touch' },
  { icon: ScrollText, text: 'An audit trail for every action' },
];

const bots = ['Chief of Staff', 'Finance', 'Operations', 'Marketing', 'HR', 'Intern'];

export default function Trust() {
  return (
    <section id="connectors" className="scroll-mt-16 bg-white px-6 py-24 font-brico text-navy">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-bold uppercase tracking-wider text-cta">Connectors</p>
        <h2 className="mt-3 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          Your Bots work in the apps you already use.
        </h2>
        <p className="mt-5 max-w-2xl text-lg text-heroslate">
          Your Bots meet you where your business already runs. Connect a service once; the
          whole team can use it.
        </p>

        <div className="mt-12 grid items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <div className="space-y-5 rounded-3xl border border-navy/10 p-6">
            {cats.map((c) => (
              <div key={c.n}>
                <p className="text-xs font-bold uppercase tracking-wider text-heroslate">{c.n}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.items.map((item) => (
                    <span
                      key={item}
                      className="rounded-full bg-ice px-3 py-1 text-xs font-bold text-cta"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <Link
              href="/connectors"
              className="block border-t border-navy/10 pt-4 text-sm font-bold text-cta hover:underline"
            >
              100+ services ready to connect &rarr;
            </Link>
          </div>

          <div className="grid place-items-center text-2xl font-bold text-cta" aria-hidden="true">
            <span className="lg:hidden">&darr;</span>
            <span className="hidden lg:inline">&rarr;</span>
          </div>

          <div className="rounded-3xl bg-navy p-7 text-white">
            <p className="text-xs font-bold uppercase tracking-wider text-bamber">Connector layer</p>
            <h3 className="mt-2 text-xl font-extrabold">The bridge between your apps and your Bots</h3>
            <ul className="mt-5 space-y-4">
              {trust.map((t) => (
                <li key={t.text} className="flex gap-2.5 text-sm text-white/80">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-blagoon">
                    <t.icon className="h-4 w-4" />
                  </span>
                  <span className="pt-1 font-semibold leading-snug">{t.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid place-items-center text-2xl font-bold text-cta" aria-hidden="true">
            <span className="lg:hidden">&darr;</span>
            <span className="hidden lg:inline">&rarr;</span>
          </div>

          <div className="rounded-3xl border border-navy/10 p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-heroslate">Every Bot on your account</p>
            <ul className="mt-4 space-y-2.5 text-sm font-semibold">
              {bots.map((b) => (
                <li key={b} className="flex items-center gap-2.5 rounded-xl bg-ice px-3.5 py-2.5">
                  <i className="h-2 w-2 rounded-full bg-cta" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
