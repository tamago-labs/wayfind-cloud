'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import HeroChatMockup from './HeroChatMockup';

export default function Hero() {
  return (
    <section className="relative grid-bg">
      <div className="max-w-[1200px] mx-auto px-6 md:px-2 pt-12 pb-20 relative z-10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        {/* Left column */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="font-display text-3xl md:text-5xl font-bold tracking-tight leading-[1.15]">
            Put Grok Bot to Work{' '}
            <span className="bg-gradient-to-r from-zenblue via-accent to-accent2 bg-clip-text text-transparent">
              Across Web3
            </span>
          </h1>

            <p className="mt-5 text-[14px] md:text-[15px] text-white/50 leading-relaxed max-w-md">
            Download bot templates that give <span className="text-accent font-semibold">Grok Bot</span> the skills and tools to access blockchain data, execute transactions, and automate onchain trading, from <span className="text-accent font-semibold">tokenized stocks</span> to multi-chain finance.
          </p>

          <div className="mt-6 flex items-center gap-3">
            <Link href="/templates" className="text-[13px] font-display font-medium bg-accent text-white px-5 py-2.5 rounded-lg hover:bg-accent/80 transition-colors">
              Browse Templates
            </Link>
            <Link href="/showcases" className="text-[13px] font-display font-medium bg-white/[0.06] text-white/70 px-5 py-2.5 rounded-lg hover:bg-white/[0.1] transition-colors border border-white/[0.08]">
              View Showcases
            </Link>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-white/35">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent2" />
              <span className="flex items-center gap-1 text-[12px] text-white/35">
                One-Click Import for <img src="/grok-bot-circle-neutral-blue.png" alt="Solana" className="w-4 h-4 inline-block rounded-full z-30" /> <img src="/grok-bot-circle-neutral-orange.png" alt="Ethereum" className="w-4 h-4 z-20 inline-block rounded-full -ml-2.5" /> <img src="/grok-bot-circle-neutral-turquoise.png" alt="BNB Chain" className="w-4 h-4 z-10 inline-block rounded-full -ml-2.5" /> <span className="text-accent font-semibold">Grok Bot</span>
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent2" />
              <span className="flex items-center gap-1 text-[12px] text-white/35">
                Works Across{' '}
                <img src="https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png" alt="Solana" className="w-4 h-4 inline-block rounded-full relative z-30" />
                <img src="https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png" alt="Ethereum" className="w-4 h-4 inline-block rounded-full -ml-2.5 relative z-20" />
                <img src="https://assets.coingecko.com/coins/images/1/standard/bitcoin.png?1696501400" alt="Bitcoin" className="w-4 h-4 inline-block rounded-full -ml-2.5 relative z-10" />{' '}
                <span className="text-accent font-semibold">10+ Networks</span>
              </span>
            </li>
            {/*<li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent2" />
              Risk Analysis with <span className="w-4 h-4 rounded-full bg-white inline-flex items-center justify-center"><img src="https://openrouter.ai/images/icons/OpenAI.svg" alt="OpenAI" className="w-3 h-3" /></span> <span className="text-accent font-semibold">GPT-6 Astra</span>
            </li>*/}
          </ul>
        </motion.div>

        {/* Right column */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex justify-center"
        >
          <HeroChatMockup />
        </motion.div>
      </div>
      </div>
    </section>
  );
}
