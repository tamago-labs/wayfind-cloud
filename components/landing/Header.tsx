'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Mascot from '@/components/Mascot';

// Solutions dropdown first; Pricing section stays on the page, unlinked.
const solutions = [
  {
    href: 'https://one.wayfind.click/',
    label: 'Wayfind ONE',
    desc: 'Disposable sandboxes running verifiable AI for sensitive work.',
  },
  {
    href: 'https://web3.wayfind.click/',
    label: 'Web3 Gateway',
    desc: 'A remote MCP that turns email into a wallet your Bots can use.',
  },
];

const navLinks = [
  { href: '/connectors', label: 'Connectors' },
  { href: '/#how', label: 'How it works' },
  { href: '/#usecases', label: 'Use cases' },
  { href: '/docs', label: 'Docs' },
];

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 shrink-0">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-navy">
        <Mascot color="white" size="xs"  motion="none" label="Wayfind mascot" />
      </span>
      <span className="font-brico text-lg font-bold text-navy">
        Wayfind
      </span>
    </Link>
  );
}

export default function Header() {
  const [open, setOpen] = useState(false);
  const [solutionsOpen, setSolutionsOpen] = useState(false);
  const solutionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!solutionsOpen) return;
    const onDown = (e: PointerEvent) => {
      if (solutionsRef.current && !solutionsRef.current.contains(e.target as Node)) setSolutionsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSolutionsOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [solutionsOpen]);

  return (
    <header className="sticky top-0 z-50 bg-herobg">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />

        <nav className="hidden items-center gap-8 text-[15px] font-medium text-navy md:flex">
          <div className="relative" ref={solutionsRef}>
            <button
              onClick={() => setSolutionsOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={solutionsOpen}
              className="flex items-center gap-1 hover:opacity-60 transition-opacity"
            >
              Solutions
              <ChevronDown className={`h-4 w-4 transition-transform ${solutionsOpen ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {solutionsOpen && (
                <motion.div
                  role="menu"
                  aria-label="Solutions"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 top-full mt-3 w-80 overflow-hidden rounded-2xl border border-navy/10 bg-white py-2 shadow-xl shadow-navy/10"
                >
                  {solutions.map((s) => (
                    <a
                      key={s.href}
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      role="menuitem"
                      onClick={() => setSolutionsOpen(false)}
                      className="block px-5 py-3 hover:bg-ice"
                    >
                      <span className="block text-[15px] font-bold text-navy">
                        {s.label} <span aria-hidden="true">→</span>
                      </span>
                      <span className="mt-0.5 block text-[13px] font-normal text-heroslate">{s.desc}</span>
                    </a>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
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
            <p className="text-xs font-bold uppercase tracking-wide text-navy/50">Solutions</p>
            {solutions.map((s) => (
              <a
                key={s.href}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="block pl-3 text-[15px] font-medium text-navy hover:opacity-60"
              >
                {s.label} <span aria-hidden="true">→</span>
              </a>
            ))}
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
