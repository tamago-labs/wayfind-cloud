import Link from 'next/link';

const plans = [
  {
    name: 'Starter',
    price: '$5',
    features: [
      'Up to 10 Bots with persistent memory',
      'Muse Glimmer credits included + BYOK',
      '1 routine, daily brief included',
      'Limited cloud computer minutes',
    ],
    featured: false,
  },
  {
    name: 'Premium',
    price: '$30',
    features: [
      'Unlimited Bots and group chats',
      'Glimmer, Wonder + supported premium models',
       'Unlimited scheduled + event routines',
      'Higher cloud computer minutes',
    ],
    featured: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    features: [
      'SSO and team Bots',
      'Dedicated region + computer capacity',
      'Audit export and SLA',
      'Talk to us — nothing self-serve to set up',
    ],
    featured: false,
    custom: true,
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-16 bg-ice px-6 py-24 font-brico text-navy">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <p className="text-sm font-bold uppercase tracking-wider text-cta">Pricing</p>
          <h2 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Free in early access. Simple after.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-heroslate">
            No card needed today. Bring your own AI key on any plan, or use ours. Idle time is never charged.
          </p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3 mx-auto max-w-6xl">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`flex flex-col rounded-3xl p-8 ${
                p.featured
                  ? 'bg-navy text-white shadow-xl shadow-navy/25 lg:-mt-4 lg:pb-12'
                  : 'bg-white shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold">{p.name}</h3>
                {p.featured && (
                  <span className="rounded-full bg-bamber px-3 py-1 text-xs font-bold text-navy">
                    Most popular
                  </span>
                )}
              </div>
              <p className="mt-3 text-5xl font-extrabold">
                {p.price}
                {'custom' in p && p.custom ? null : (
                  <span className={`text-lg font-semibold ${p.featured ? 'text-white/60' : 'text-heroslate'}`}>
                    /mo
                  </span>
                )}
              </p>
              <ul className={`mt-6 flex-1 space-y-2.5 ${p.featured ? 'text-white/80' : 'text-heroslate'}`}>
                {p.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {'custom' in p && p.custom ? (
                <a
                  href="https://x.com/WayfindZZZ"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-8 rounded-full border-2 border-navy px-6 py-3 text-center font-semibold text-navy transition-colors hover:bg-navy hover:text-white"
                >
                  Talk to us
                </a>
              ) : (
                <Link
                  href="/app"
                  className={`mt-8 rounded-full px-6 py-3 text-center font-semibold transition-colors ${
                    p.featured
                      ? 'bg-cta text-white hover:bg-ctahover'
                      : 'border-2 border-navy text-navy hover:bg-navy hover:text-white'
                  }`}
                >
                  Join early access
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
