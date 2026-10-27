'use client';

import Section from './Section';

const tiers = [
  {
    name: 'Starter',
    price: '$5',
    credits: '1,000',
    discount: null,
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$20',
    credits: '5,000',
    discount: '20%',
    highlight: true,
  },
  {
    name: 'Power',
    price: '$50',
    credits: '15,000',
    discount: '50%',
    highlight: false,
    bestValue: true,
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="py-24 scroll-mt-14">
      <div className="max-w-4xl mx-auto px-6">
        <Section>
          <p className="text-[13px] text-accent uppercase tracking-wider text-center mb-6">Pricing</p>
        </Section>

        <Section>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-center tracking-tight mb-4">
            Here&apos;s what we&apos;re planning
          </h2>
        </Section>

        <Section>
          <p className="text-[15px] text-white/50 leading-relaxed text-center max-w-2xl mx-auto mb-12">
            Wayfind is currently free. As we scale, we&apos;ll introduce usage-based AI credits so you only pay for the AI analysis you actually use.
          </p>
        </Section>

        <Section>
          <div className="grid md:grid-cols-3 gap-4 md:gap-6">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-2xl border p-6 md:p-8 ${
                  tier.highlight
                    ? 'border-accent bg-accent/[0.04]'
                    : 'border-border3/50 bg-white/[0.02]'
                }`}
              >
                {tier.bestValue && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-accent rounded-full text-[11px] font-semibold text-white">
                    Best value
                  </div>
                )}

                <h3 className="font-display text-xl font-bold mb-1">{tier.name}</h3>

                <div className="mt-4 mb-1">
                  <span className="text-3xl font-bold">{tier.price}</span>
                </div>

                <p className="text-[14px] text-white/40 mb-4">{tier.credits} credits</p>

                {tier.discount && (
                  <span className="inline-block px-2.5 py-1 rounded-full bg-accent/10 text-accent text-[12px] font-semibold">
                    {tier.discount} savings
                  </span>
                )}
              </div>
            ))}
          </div>
        </Section>

        <Section>
          <p className="mt-8 text-[12px] text-white/30 text-center">
            Priced in USD, payable in stablecoins. Credits never expire.
          </p>
        </Section>
      </div>
    </section>
  );
}
