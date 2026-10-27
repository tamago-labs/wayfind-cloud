'use client';

import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import Section from './Section';
import { finders } from './finders';

export function pickJob(id: string) {
  window.dispatchEvent(new CustomEvent('wayfind:pick-job', { detail: id }));
  document.getElementById('create')?.scrollIntoView({ behavior: 'smooth' });
}

export default function BotCapabilities() {
  return (
    <section id="bots" className="py-20 md:py-24 scroll-mt-16">
      <div className="max-w-[1200px] mx-auto px-5 md:px-8">
        <Section>
          <p className="font-mono text-[12px] text-accent text-center mb-4">meet your bots</p>
          <h2 className="font-display text-3xl md:text-[40px] font-bold text-center tracking-tight text-ink leading-tight">
            A list of Bots, each with a face,
            <br className="hidden md:block" /> a name, and one job.
          </h2>
          <p className="text-center text-inksoft text-[15px] max-w-xl mx-auto mt-4">
            Like messaging a teammate: each Finder keeps its own memory and conversations,
            and they all share your one cloud computer. Start from a role — rename it,
            re-brief it, make it yours. Picking one pre-fills your first Bot below.
          </p>
        </Section>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-12">
          {finders.map((f, i) => (
            <motion.article
              key={f.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="bg-cream rounded-3xl border border-line p-6 shadow-card flex flex-col hover:-translate-y-1 transition-transform"
            >
              <img src={f.img} alt={`${f.name} — ${f.job}`} className={`w-24 h-24 rounded-full object-cover ring-4 ${f.ring} mx-auto`} />
              <h3 className="font-display text-lg font-semibold text-center text-ink mt-4">{f.name}</h3>
              <p className="font-mono text-[11px] text-inksoft text-center mt-1">{f.trait}</p>
              <p className="font-mono text-[11px] text-center mt-2">
                <span className={`inline-block px-2.5 py-1 rounded-full font-medium ${f.chip}`}>{f.job}</span>
              </p>

              <p className="text-[13.5px] text-inksoft leading-relaxed mt-4 flex-1">{f.does}</p>
              <p className="font-mono text-[11.5px] text-ink/70 leading-relaxed mt-3 border-t border-line pt-3">{f.outcome}</p>

              <div className="flex flex-wrap gap-1.5 mt-4">
                {f.connectors.map((c) => (
                  <span key={c} className="font-mono text-[10.5px] px-2 py-1 rounded-md bg-paper border border-line text-inksoft">{c}</span>
                ))}
              </div>

              <button
                onClick={() => pickJob(f.id)}
                className="mt-5 inline-flex items-center justify-center gap-1.5 text-[13px] font-display font-medium bg-ink text-white px-4 py-2.5 rounded-lg hover:bg-accent transition-colors"
              >
                Start with {f.name} <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </motion.article>
          ))}
        </div>

        <Section>
          <p className="text-center font-mono text-[11.5px] text-inksoft mt-8">
            prefer a blank slate? create a Bot with any name and job — these four are just good first hires.
          </p>
        </Section>
      </div>
    </section>
  );
}
