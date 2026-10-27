'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const navLinks = [
  { href: '/#bots', label: 'bots' },
  { href: '/#how', label: 'how' },
  { href: '/#chat', label: 'chat' },
  { href: '/#computer', label: 'computer' },
  { href: '/#pricing', label: 'pricing' },
  { href: '/#faq', label: 'faq' },
];

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 shrink-0">
      <span className="w-8 h-8 rounded-[9px] bg-ink flex items-center justify-center shadow-card">
        <span className="text-[19px] leading-none font-brand text-white rotate-[-8deg] translate-y-[1px]">W</span>
      </span>
      <span className="font-display text-[17px] font-semibold tracking-tight text-ink">
        Wayfind<span className="text-accent"> Cloud</span>
      </span>
    </Link>
  );
}

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-paper/90 backdrop-blur border-b border-line">
      <div className="max-w-[1200px] mx-auto px-5 md:px-8 h-16 flex items-center gap-8">
        <Logo />

        <nav className="hidden md:flex items-center gap-6 font-mono text-[12.5px] text-inksoft font-medium">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-ink transition-colors">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3 ml-auto">
          <span className="font-mono text-[11px] text-inksoft hidden lg:flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent2" /> free in early access
          </span>
          <Link href="/app" className="font-mono text-[12.5px] text-inksoft hover:text-ink transition-colors">
            app →
          </Link>
          <Link
            href="/#create"
            className="text-[13px] font-display font-medium bg-ink text-white px-4 py-2 rounded-lg hover:bg-accent transition-colors"
          >
            Create my bot
          </Link>
        </div>

        <button onClick={() => setOpen(!open)} className="md:hidden ml-auto text-ink/60 hover:text-ink transition-colors" aria-label="Menu">
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden border-t border-line bg-cream px-5 py-4 space-y-3 overflow-hidden"
          >
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="block font-mono text-[13px] text-inksoft hover:text-ink">
                {link.label}
              </Link>
            ))}
            <Link href="/app" onClick={() => setOpen(false)} className="block font-mono text-[13px] text-inksoft hover:text-ink">
              app →
            </Link>
            <Link href="/#create" onClick={() => setOpen(false)} className="block mt-2 text-center text-[13px] font-display font-medium bg-ink text-white px-4 py-2.5 rounded-lg">
              Create my bot
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
