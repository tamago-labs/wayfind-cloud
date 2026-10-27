'use client';

import Section from './Section';

export default function Background() {
  return (
    <section className="py-24">
      <div className="max-w-5xl mx-auto px-6">
        <div className="grid md:grid-cols-5 gap-12 items-start">
          {/* Left — 40% */}
          <div className="md:col-span-2">
            <Section>
              <p className="text-[13px] text-accent uppercase tracking-wider mb-6">Background</p>
            </Section>
            <Section>
              <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
                What is a bot template?
              </h2>
            </Section>
          </div>

          {/* Right — 60% */}
          <div className="md:col-span-3">
            <Section>
              <p className="text-[15px] text-white/50 leading-relaxed">
                A bot template equips a <span className="text-accent font-semibold">Grok Bot</span> with the tools it needs, context for its work. Whether you create a <span className="text-accent font-semibold">Research bot</span> to understand tokenized stocks or a <span className="text-accent font-semibold">CFO bot</span> to manage onchain payments, it starts with capabilities tailored to the task.
              </p>
            </Section>

            <Section>
              <p className="mt-6 text-lg md:text-xl font-display font-semibold text-white/80 leading-snug">
                Bot Template = Tools + Agent Skills + Short-Term Memory
              </p>
            </Section>

            <Section>
              <p className="mt-6 text-[15px] text-white/50 leading-relaxed">
                Wayfind provides ready-to-use bot templates to help you get started in one click. If you want to use other AI platform like <span className="text-accent font-semibold">Muse</span> or <span className="text-accent font-semibold">Dots</span> you can import Wayfind's agent skills then your AI will take care the rest.
              </p>
            </Section>
          </div>
        </div>
      </div>
    </section>
  );
}
