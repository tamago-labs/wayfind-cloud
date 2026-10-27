import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import Section from './Section';

export default function CTA() {
  return (
    <section className="py-12 md:py-24 grid-bg">
      <div className="max-w-3xl mx-auto px-2 md:px-6">
        <Section>
          <div className="relative p-4">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[80%] h-[60%] bg-accent/10 blur-[100px] rounded-full" />
            </div>
            <div className="relative bg-surface rounded-2xl p-6 md:p-10 text-center z-10">
              <h2 className="font-display text-xl md:text-3xl lg:text-4xl font-semibold tracking-tight">
                Build Your Always-On Web3 Team
              </h2>
              <p className="mt-4 text-sm md:text-[15px] text-white/45">
                Start with one-click Grok Bot templates for tokenized stock research, treasury management, payroll, and more across supported chains.
              </p>
              <Link
                href="/#demo"
                className="mt-8 inline-flex items-center justify-center gap-2 w-full md:w-auto text-[15px] font-medium bg-accent text-white px-8 py-4 rounded-lg hover:bg-accent/80 transition-colors"
              >
                See Demo <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </Section>
      </div>
    </section>
  );
}
