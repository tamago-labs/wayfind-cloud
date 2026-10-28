'use client';

import { useRef, useState } from 'react';
import Mascot, { type MascotColor, type MascotShape } from '@/components/Mascot';

const cards: { color: MascotColor; shape: MascotShape; title: string; body: string }[] = [
  {
    color: 'amber',
    shape: 'squircle',
    title: 'Bundled into big plans',
    body: 'Grok Bot, OpenAI Dots and Claude Duet come with subscriptions costing $20–$300 a month.',
  },
  {
    color: 'lagoon',
    shape: 'circle',
    title: 'Not available everywhere',
    body: 'Many AI agents launch in limited regions. Outside those markets, access can be a barrier before you start.',
  },
  {
    color: 'moss',
    shape: 'pebble',
    title: 'Locked into one vendor',
    body: 'Your workflow should not depend on one vendor. Choose the AI that fits each task, and switch anytime.',
  },
];

export default function Problem() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);

  const onScroll = () => {
    const el = trackRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    setIdx(Math.round((el.scrollLeft / (el.scrollWidth - el.clientWidth)) * (cards.length - 1)));
  };

  const go = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: (i / (cards.length - 1)) * (el.scrollWidth - el.clientWidth), behavior: 'smooth' });
  };

  return (
    <section id="problem" className="scroll-mt-16 bg-ice px-6 py-24 font-brico text-navy">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-bold uppercase tracking-wider text-cta">The problem</p>
        <h2 className="mt-3 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          Always-on agents shouldn&rsquo;t need an enterprise budget.
        </h2>
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2 [scrollbar-width:none] md:grid md:grid-cols-3 md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden"
        >
          {cards.map((c, i) => (
            <div key={c.title} className="min-w-[85%] snap-center rounded-3xl bg-white p-7 shadow-sm sm:min-w-[60%] md:min-w-0">
              <Mascot color={c.color} shape={c.shape} size="md" motion="none" blinkDelay={`-${i * 1.4}s`} />
              <h3 className="mt-5 text-xl font-bold">{c.title}</h3>
              <p className="mt-2 text-heroslate">{c.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-center gap-2 md:hidden" role="tablist" aria-label="Problem cards">
          {cards.map((c, i) => (
            <button
              key={c.title}
              role="tab"
              aria-selected={i === idx}
              aria-label={`Show: ${c.title}`}
              onClick={() => go(i)}
              className={`h-2 rounded-full transition-all ${i === idx ? 'w-6 bg-cta' : 'w-2 bg-navy/20'}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
