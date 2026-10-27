'use client';

import { Download } from 'lucide-react';

const templates = [
  {
    chain: 'Solana',
    version: 'v1.0',
    description: 'Create an API key before using',
    available: true,
    logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png',
  },
  {
    chain: 'More Chains',
    version: 'Coming Soon',
    description: '',
    available: false,
    logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png',
  },
];

export default function TemplateCards() {
  return (
    <div className="flex flex-col gap-3">
      {templates.map((t) => (
        <div
          key={t.chain}
          className="relative rounded-xl border border-border3 bg-white/[0.03] p-4 flex items-center gap-5"
        >
          {/* Gradient accent left border */}
          <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-gradient-to-b from-zenblue to-zenpurple" />

          {/* Logo + Chain name */}
          <div className="flex items-center gap-3 min-w-[160px]">
            <img src={t.logo} alt={t.chain} className="w-8 h-8 rounded-full" />
            <span className="font-display font-semibold text-white text-sm">{t.chain}</span>
            <span className="text-[10px] text-white/40 bg-white/[0.06] px-2 py-0.5 rounded-full hidden md:inline">{t.version}</span>
          </div>

          {/* Description */}
          <p className="text-[12px] text-white/40 leading-relaxed flex-1 hidden md:block">
            {t.description}
          </p>

          {/* Download button */}
          {t.available ? (
            <a
              href="https://x.ai/bot/EpQzEq9pQvX_utfgsxzbj"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-white text-xs font-semibold px-5 py-2.5 rounded-lg bg-gradient-to-r from-zenblue to-zenpurple hover:opacity-90 transition-opacity shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </a>
          ) : (
            <button
              disabled
              className="flex items-center gap-2 text-white/30 text-xs font-semibold px-5 py-2.5 rounded-lg bg-white/[0.06] border border-border3/40 cursor-not-allowed shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
          )}
        </div>
      ))}
    </div>
  );
}