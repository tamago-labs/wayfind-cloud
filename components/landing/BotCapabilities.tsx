'use client';

import { motion } from 'framer-motion';
import { Wallet, TrendingUp, Building2, PenLine } from 'lucide-react';

const cards = [
  {
    icon: Wallet,
    title: 'Payroll automation',
    subtitle: 'Coordinate freelancer payments, USDC transfers, and onchain payslips with HR and CFO bots.',
  },
  {
    icon: TrendingUp,
    title: 'Treasury management',
    subtitle: 'CFO and Research bots evaluate protocol data, compare stablecoin yields, and prepare treasury allocations for approval.',
  },
  {
    icon: Building2,
    title: 'Tokenized stocks',
    subtitle: 'Research and Investment Analyst bots investigate tokenized equities, compare onchain market data, and identify opportunities.',
  },
  {
    icon: PenLine,
    title: 'Research and publishing',
    subtitle: 'Research and Marketing bots turn ecosystem insights into content and publish approved updates onchain.',
  },
];

export default function BotCapabilities() {
  return (
    <section className="py-24">
      <div className="max-w-5xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <p className="text-[13px] text-accent uppercase tracking-wider mb-4">Capabilities</p>
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
            What your bots can do
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {cards.map((card, i) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 hover:border-white/[0.1] transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-accent" />
                </div>
                <h3 className="text-[15px] font-display font-semibold mb-2">{card.title}</h3>
                <p className="text-[13px] text-white/45 leading-relaxed">{card.subtitle}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
