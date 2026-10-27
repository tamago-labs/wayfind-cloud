'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import Mascot, { type MascotColor } from '@/components/Mascot';

// Hero mascot row (wayfind-hero-design.html option E): amber, moss, lagoon, ash.
const mascots: MascotColor[] = ['amber', 'moss', 'lagoon', 'ash'];

// Option E (wayfind-hero-design.html): rising job-message bubbles, negative
// delays so the loop is already populated on first paint.
const bubbles = [
  { left: 'left-[4%]', cls: 'bg-white text-navy shadow', text: 'Draft the Friday update', delay: '0s' },
  { left: 'left-[22%]', cls: 'bg-bamber text-navy', text: 'Invoice sent', delay: '-4s' },
  { left: 'left-[62%]', cls: 'bg-white text-navy shadow', text: 'Reproduce bug 212', delay: '-8s' },
  { left: 'left-[80%]', cls: 'bg-blagoon text-white', text: 'Approved', delay: '-2s' },
  { left: 'left-[12%]', cls: 'bg-bmoss text-white', text: '3 leads found', delay: '-11s' },
  { left: 'left-[88%]', cls: 'bg-white text-navy shadow', text: 'Check ad spend', delay: '-6s' },
  { left: 'left-[70%]', cls: 'bg-cta text-white', text: 'Stop now', delay: '-13s' },
];

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-herobg text-navy">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[640px] text-sm font-semibold">
        {bubbles.map((b) => (
          <span
            key={b.text}
            className={`animate-rise absolute bottom-0 rounded-full px-4 py-2 ${b.left} ${b.cls}`}
            style={{ animationDelay: b.delay }}
          >
            {b.text}
          </span>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative mx-auto max-w-5xl px-6 pb-40 pt-20 text-center"
      >
        <div className="mx-auto mb-6 flex justify-center -space-x-3">
          {mascots.map((color, i) => (
            <Mascot
              key={color}
              color={color}
              size="md"
              motion="none"
              blink="calm"
              blinkDelay={`-${i * 1.4}s`}
              className="ring-4 ring-herobg"
            />
          ))}
        </div>

        <h1 className="font-brico text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-7xl">
          The always-on agent, without the enterprise price.
        </h1>
        <p className="mx-auto mt-6 max-w-lg text-lg text-heroslate">
          Name a Bot, give it a job, and let it work in the background on the model you choose. From $5/month.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <Link href="/app" className="rounded-full bg-cta px-8 py-4 font-semibold text-white hover:bg-ctahover transition-colors">
            Create your first Bot
          </Link>
          <span className="text-sm text-heroslate">Free in early access. No card.</span>
        </div>
      </motion.div>
    </section>
  );
}
