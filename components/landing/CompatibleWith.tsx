'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

const cards = [
  { name: 'Grok Bot', tagline: 'Download a bot template', url: 'https://x.ai/bot', image: 'https://cdn.prod.website-files.com/689f5720d02bfbed3bbc3f87/6ac39e979d9600aaa9ef21b7_grok_card.avif' },
  { name: 'Muse', tagline: 'Via Agent Skills', url: 'https://ai.meta.com/muse/', image: 'https://cdn.prod.website-files.com/689f5720d02bfbed3bbc3f87/6ac39e98acc823c4b1f2796c_muse_card.avif' },
  { name: 'Dots', tagline: 'Via Agent Skills', url: 'https://openai.com/index/introducing-dots/', image: 'https://cdn.prod.website-files.com/689f5720d02bfbed3bbc3f87/6ac39e98669dae1a60fcbae8_dots_card.avif' },
  { name: 'Cursor', tagline: 'Via Agent Skills', url: 'https://cursor.com/download', image: '/cursor-desktop-card.jpg' },
  { name: 'Cherry Studio', tagline: 'Via Agent Skills', url: 'https://cherryai.com/', image: '/cherry-studio-card.jpg' },
];

const VISIBLE_DESKTOP = 3;
const VISIBLE_MOBILE = 1;

export default function CompatibleWith() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(VISIBLE_DESKTOP);

  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth < 640;
      setVisible(isMobile ? VISIBLE_MOBILE : VISIBLE_DESKTOP);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const scrollToIndex = useCallback((index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = el.scrollWidth / cards.length;
    el.scrollTo({ left: cardWidth * index, behavior: 'smooth' });
    setActive(index);
  }, []);

  const next = () => scrollToIndex(Math.min(active + 1, cards.length - visible));
  const prev = () => scrollToIndex(Math.max(active - 1, 0));

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const cardWidth = el.scrollWidth / cards.length;
      const index = Math.round(el.scrollLeft / cardWidth);
      setActive(Math.min(index, cards.length - visible));
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [visible]);

  return (
    <section className="relative grid-bg py-24">
      <div className="absolute w-[400px] h-[400px] top-1/2 -translate-y-1/2 -left-40 rounded-full blur-[100px] opacity-30 bg-accent pointer-events-none" />
      <div className="absolute w-[350px] h-[350px] top-1/2 -translate-y-1/2 -right-32 rounded-full blur-[100px] opacity-30 bg-zenpurple pointer-events-none" />

      <div className="max-w-5xl mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <p className="text-[13px] text-accent uppercase tracking-wider mb-4">Compatibility</p>
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
            Works with any AI you use
          </h2>
        </motion.div>

        <div className="relative">
          <div className="flex items-center gap-4">
            <button
              onClick={prev}
              disabled={active === 0}
              className="shrink-0 w-9 h-9 rounded-full bg-white/[0.08] border border-white/[0.08] flex items-center justify-center text-white/50 hover:text-white transition-colors disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div
              ref={scrollRef}
              className="flex-1 flex overflow-x-auto scrollbar-hide scroll-smooth snap-x snap-mandatory gap-5"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {cards.map((card) => (
                <a
                  key={card.name}
                  href={card.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative aspect-square rounded-2xl overflow-hidden group cursor-pointer block shrink-0 snap-start"
                  style={{ width: `calc(${100 / visible}% - ${(visible - 1) * 20 / visible}px)` }}
                >
                  <img
                    src={card.image}
                    alt={card.name}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30" />
                  <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between">
                    <span className="text-[15px] font-display font-semibold text-white">{card.name}</span>
                    <div className="w-7 h-7 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/[0.08] group-hover:bg-white/20 transition-colors">
                      <ArrowUpRight className="w-3.5 h-3.5 text-white/70" />
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <span className="text-[12px] text-white/60">{card.tagline}</span>
                  </div>
                </a>
              ))}
            </div>

            <button
              onClick={next}
              disabled={active >= cards.length - visible}
              className="shrink-0 w-9 h-9 rounded-full bg-white/[0.08] border border-white/[0.08] flex items-center justify-center text-white/50 hover:text-white transition-colors disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex justify-center gap-1.5 mt-6 sm:hidden">
            {cards.map((_, i) => (
              <button
                key={i}
                onClick={() => scrollToIndex(i)}
                className={`w-2 h-2 rounded-full transition-colors ${i === active ? 'bg-accent' : 'bg-white/20'}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
