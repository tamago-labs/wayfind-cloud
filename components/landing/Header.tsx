'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Mascot from '@/components/Mascot';

// Nav anchors follow wayfind-sections.html: #problem #how #bots #trust #pricing #faq.
const navLinks = [
  { href: '/#problem', label: 'Problem' },
  { href: '/#how', label: 'How' },
  { href: '/#bots', label: 'Bots' },
  { href: '/#trust', label: 'Trust' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
];

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 shrink-0">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-navy">
        <Mascot color="white" size="xs"  motion="none" label="Wayfind Cloud mascot" />
      </span>
      <span className="font-brico text-lg font-bold text-navy">
        Wayfind Cloud
      </span>
    </Link>
  );
}

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-herobg">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />

        <nav className="hidden items-center gap-8 text-[15px] font-medium text-navy md:flex">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="hover:opacity-60 transition-opacity">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 text-[15px] font-medium md:flex">
          <Link href="/app" className="hidden text-navy hover:opacity-60 transition-opacity sm:block">
            Log in
          </Link>
          <Link
            href="/app"
            className="rounded-full bg-navy px-5 py-2.5 text-white hover:opacity-90 transition-opacity"
          >
            Start free
          </Link>
        </div>

        <button onClick={() => setOpen(!open)} className="md:hidden ml-auto text-navy/60 hover:text-navy transition-colors" aria-label="Menu">
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
            className="md:hidden border-t border-navy/10 bg-herobg px-6 py-4 space-y-3 overflow-hidden"
          >
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="block text-[15px] font-medium text-navy hover:opacity-60">
                {link.label}
              </Link>
            ))}
            <Link href="/app" onClick={() => setOpen(false)} className="block text-[15px] font-medium text-navy hover:opacity-60">
              Log in
            </Link>
            <Link href="/app" onClick={() => setOpen(false)} className="block mt-2 text-center rounded-full bg-navy px-5 py-2.5 text-[15px] font-medium text-white">
              Start free
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
