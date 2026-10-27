'use client';

import Link from 'next/link';
import Section from './Section';

const tiers = [
  {
    name: 'Starter',
    price: '$5',
    highlight: false,
    features: ['1 Bot on your shared computer', 'Chat + approvals in chat', '1 routine (morning brief included)', 'Capped computer minutes + model credits'],
  },
  {
    name: 'Operator',
    price: '$10',
    highlight: true,
    features: ['Up to 5 Bots', 'Group chats + Bot handoffs', 'All beta connect apps', 'Scheduled + event routines · BYOK (later)'],
  },
  {
    name: 'Studio',
    price: '$20',
    highlight: false,
    features: ['Up to 15 Bots', 'Roster sections per project/client', 'Shared team Bots', 'Priority computer capacity'],
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="py-20 md:py-24 scroll-mt-16">
      <div className="max-w-[1100px] mx-auto px-5 md:px-8">
        <Section>
          <p className="font-mono text-[12px] text-accent text-center mb-4">pricing</p>
          <h2 className="font-display text-3xl md:text-[40px] font-bold text-center tracking-tight text-ink">
            Hire outcomes, not chat
          </h2>
          <p className="text-[15px] text-inksoft leading-relaxed text-center max-w-xl mx-auto mt-4">
            Grok Bot comes bundled with a Cursor or SuperGrok subscription. Wayfind is the
            standalone version: free in early access, then from $5 — and you pay for active
            Bot work and computer minutes, never for an idle machine.
          </p>
        </Section>

        <div className="grid md:grid-cols-3 gap-5 mt-12">
          {tiers.map((tier) => (
            <Section key={tier.name}>
              <div className={`relative rounded-3xl border p-7 h-full flex flex-col ${tier.highlight ? 'border-accent bg-accent/[0.04] shadow-card' : 'border-line bg-cream shadow-card'}`}>
                {tier.highlight && (
                  <span className="absolute -top-3 left-6 px-3 py-1 bg-accent rounded-full font-mono text-[10.5px] font-medium text-white">most operators</span>
                )}
                <h3 className="font-display text-lg font-semibold text-ink">{tier.name}</h3>
                <p className="mt-3">
                  <span className="font-display text-4xl font-bold text-ink">{tier.price}</span>
                  <span className="text-inksoft text-sm"> /mo planned</span>
                </p>
                <ul className="mt-5 space-y-2.5 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="text-[13.5px] text-inksoft flex gap-2">
                      <span className="text-accent2 mt-0.5">✓</span>{f}
                    </li>
                  ))}
                </ul>
                <Link href="/#create" className={`mt-7 text-center text-[13.5px] font-display font-medium px-4 py-2.5 rounded-lg transition-colors ${tier.highlight ? 'bg-accent text-white hover:bg-accent/85' : 'bg-ink text-white hover:bg-accent'}`}>
                  Start free
                </Link>
              </div>
            </Section>
          ))}
        </div>

        <Section>
          <p className="mt-8 font-mono text-[11px] text-inksoft text-center">
            not on sale yet · existing free users are notified before any billing ever starts
          </p>
        </Section>
      </div>
    </section>
  );
}
