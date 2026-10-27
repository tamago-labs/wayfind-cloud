'use client';

import Section from './Section';


const steps = [
  {
    num: '01',
    title: 'Download bot templates',
    description: (
      <>
        Browse bot templates spanning <span className="text-white/70 font-medium">Solana Tokenized Stocks</span> to <span className="text-white/70 font-medium">Circle USDC Payments</span>, each with skills and memory included.
      </>
    ),
    example: null,
  },
  {
    num: '02',
    title: 'Create your agentic wallet',
    description: (
      <>
        Your bot creates an encrypted wallet on <span className="text-white/70 font-medium">bot&apos;s computer</span>. Provide a Wayfind API key (optional) to access <span className="text-white/70 font-medium">tokenized stocks data</span>.
      </>
    ),
    example: null,
  },
  {
    num: '03',
    title: 'Put your bots to work',
    description: (
      <>
        Build a bot team. Name a <span className="text-white/70 font-medium">CFO</span> to manage treasury, an <span className="text-white/70 font-medium">HR</span> to run payroll, a <span className="text-white/70 font-medium">Research</span> to track data. They coordinate tasks and execute onchain around the clock.
      </>
    ),
    example: null,
  },
  {
    num: '04',
    title: 'Share your Web3 service',
    description: (
      <>
        Whether it's a <span className="text-white/70 font-medium">WhatsApp bot</span> or <span className="text-white/70 font-medium">web dashboard</span>, let other users see what your bots can do and get inspired to build their own.
      </>
    ),
    example: null,
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 grid-bg scroll-mt-14 relative overflow-hidden">
      <div className="absolute w-[400px] h-[400px] top-1/2 -translate-y-1/2 -left-40 rounded-full blur-[100px] opacity-30 bg-accent pointer-events-none" />
      <div className="absolute w-[350px] h-[350px] top-1/2 -translate-y-1/2 -right-32 rounded-full blur-[100px] opacity-30 bg-zenpurple pointer-events-none" />
      <div className="max-w-3xl mx-auto px-6">
        <Section>
          <p className="text-[13px] text-accent uppercase tracking-wider text-center mb-4">How it works</p>
        </Section>

        <Section>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-center tracking-tight mb-12">
            Your path starts here
          </h2>
        </Section>

        <div className="max-w-lg mx-auto">
          <Section>
          <div className="relative pl-16">
            <div className="absolute left-[18px] top-4 bottom-4 w-px bg-border3" />

            <div className="space-y-10">
              {steps.map((step) => (
                <div key={step.num} className="relative">
                  <div className="absolute -left-16 top-1 w-9 h-9 flex items-center justify-center">
                    <span className="text-[18px] font-mono text-accent">{step.num}</span>
                  </div>

                  <h3 className="text-[16px] font-semibold mb-1">{step.title}</h3>
                  <p className="text-[14px] text-white/45 leading-relaxed">{step.description}</p>
                  {step.example && (
                    <p className="mt-2 text-[13px] text-accent/70 italic">{step.example}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Section>
        </div>

        
      </div>
    </section>
  );
}
