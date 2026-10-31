'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';

const plans = [
  {
    name: 'Free',
    price: '$0',
    features: [
      'Up to 3 Bots with persistent memory',
      'Meta open-weight models',
      'Limited usage to try your first Bots',
    ],
    featured: false,
  },
  {
    name: 'Starter',
    price: '$5',
    features: [
      'Up to 5 Bots with persistent memory',
      'Meta open-weight models',
      'Generous usage limits',
      '1 scheduled routine',
    ],
    featured: true,
  },
  {
    name: 'Premium',
    price: '$30',
    features: [
      'Up to 10 Bots and group chats',
      'Muse Wonder for complex and graphical work',
      'Highest usage limits',
      '10 scheduled routines',
    ],
    featured: false,
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
  const trackRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);

  const onScroll = () => {
    const el = trackRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    setIdx(Math.round((el.scrollLeft / (el.scrollWidth - el.clientWidth)) * (plans.length - 1)));
  };

  const go = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: (i / (plans.length - 1)) * (el.scrollWidth - el.clientWidth), behavior: 'smooth' });
  };

  return (
    <section id="pricing" className="scroll-mt-16 bg-ice px-6 py-24 font-brico text-navy">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <p className="text-sm font-bold uppercase tracking-wider text-cta">Pricing</p>
          <h2 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Free in early access. Simple after.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-heroslate">
            No card needed today. Idle time is never charged.
          </p>
        </div>
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2 [scrollbar-width:none] min-[480px]:grid min-[480px]:grid-cols-2 min-[480px]:overflow-visible min-[480px]:pb-0 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden mx-auto max-w-6xl"
        >
          {plans.map((p) => (
            <div
              key={p.name}
              className={`flex min-w-[85%] snap-center flex-col rounded-3xl p-8 min-[480px]:min-w-0 ${
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
                  {p.name === 'Free' ? 'Start free' : 'Join early access'}
                </Link>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-center gap-2 min-[480px]:hidden" role="tablist" aria-label="Pricing plans">
          {plans.map((p, i) => (
            <button
              key={p.name}
              role="tab"
              aria-selected={i === idx}
              aria-label={`Show: ${p.name}`}
              onClick={() => go(i)}
              className={`h-2 rounded-full transition-all ${i === idx ? 'w-6 bg-cta' : 'w-2 bg-navy/20'}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
