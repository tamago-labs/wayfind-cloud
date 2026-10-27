'use client';

import { motion } from 'framer-motion';
import { useEffect, useState, useRef } from 'react';

const chatSteps = [
  { type: 'ai', text: 'Hi, I\'m Wayfind 👋 I can pull tokenized-stock data and handle Solana swaps. What do you want to start with?' },
  { type: 'user', text: 'List TSLA related tokens and give me a brief summary' },
  { type: 'ai', text: 'Pulling the TSLA tokens now.' },
  { type: 'ai', text: 'Wayfind tracks 7 tokenized TSLA versions. All trade near $382.6–$383.0, up ~0.1% in 24h, ~4% over 7 days, and ~4.7–5% over 30 days.' },
  { type: 'user', text: 'Can I buy TSLAX with 1 SOL?' },
  { type: 'ai', text: 'Getting you a quote on OKX DEX Router...' },
  { type: 'ai', text: '1 SOL ≈ 2.1 TSLAX at $382.9 each. Slippage: 0.5%. Ready to execute — approve the swap?' },
];

export default function HeroChatMockup() {
  const [visibleSteps, setVisibleSteps] = useState(0);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    chatSteps.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleSteps(i + 1), (i + 1) * 2000));
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [visibleSteps]);

  return (
    <div className="mx-auto w-full max-w-[280px]">
      <div className="relative rounded-[28px] border border-white/[0.08] bg-[#0a0a0f] p-2 shadow-2xl">
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-20 h-5 bg-[#0a0a0f] rounded-b-xl z-10" />

        <div className="rounded-[20px] bg-gradient-to-b from-[#0f1019] to-[#080810] overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-3 pb-2">
            <span className="text-[10px] text-white/40 font-medium">9:41</span>
            <div className="flex gap-1">
              <div className="w-3 h-1.5 rounded-sm bg-white/30" />
              <div className="w-1.5 h-1.5 rounded-full bg-white/30" />
            </div>
          </div>

          <div className="px-4 pb-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <img src="/grok-bot-circle-neutral-turquoise.png" alt="Wayfind" className="w-6 h-6 rounded-full" />
              <div>
                 <p className="text-[11px] font-semibold text-white/90">Wayfind Demo</p>
                <p className="text-[9px] text-accent">online</p>
              </div>
            </div>
          </div>

          <div ref={chatRef} className="px-3 py-4 space-y-2 h-[340px] overflow-y-auto scrollbar-hide">
            {visibleSteps > 0 && chatSteps.slice(0, visibleSteps).map((step, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className={`flex ${step.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-2 text-[11px] leading-relaxed ${
                        step.type === 'user'
                          ? 'bg-gradient-to-r from-zenblue to-zenpurple text-white rounded-br-sm'
                          : 'bg-white/[0.06] text-white/70 rounded-bl-sm'
                      }`}
                    >
                      {step.text}
                    </div>
                  </motion.div>
                ))}
            {visibleSteps > 0 && visibleSteps < chatSteps.length && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex justify-start"
                  >
                    <div className="bg-white/[0.06] rounded-2xl rounded-bl-sm px-3 py-2 flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </motion.div>
                )}
          </div>
        </div>
      </div>
    </div>
  );
}
