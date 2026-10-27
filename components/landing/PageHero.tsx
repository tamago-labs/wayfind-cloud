'use client';

import { motion } from 'framer-motion';

interface PageHeroProps {
  title: string;
  subtitle?: string;
}

export default function PageHero({ title, subtitle }: PageHeroProps) {
  return (
    <div className="max-w-[1200px] mx-auto px-6 md:px-2 pt-8 pb-6">
      <div className="flex items-center gap-3">
        <motion.div
          initial={{ opacity: 0, scaleY: 0 }}
          animate={{ opacity: 1, scaleY: 1 }}
          transition={{ duration: 0.4 }}
          className="w-[3px] h-7 rounded-full bg-gradient-to-b from-zenblue to-zenpurple origin-top shrink-0"
        />
        <motion.h1
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="text-2xl md:text-3xl font-display font-semibold tracking-tight"
        >
          {title}
        </motion.h1>
      </div>
      {subtitle && (
        <p className="text-[14px] md:text-[16px] text-white/40 mt-2">
          {subtitle}
        </p>
      )}
    </div>
  );
}
