'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const navLinks = [
  { href: '/#demo', label: 'Video Demo' },
  { href: '/#faq', label: 'FAQ' },
];

export default function Header() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href.startsWith('#')) return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <header className="border-b border-border3/50">
      <div className="max-w-[1200px] mx-auto px-6 md:px-2 h-14 flex items-center gap-8">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-zenblue to-zenpurple flex">
            <span className="text-[20px] font-brand text-center mx-auto rotate-[-10deg] ml-[5px] mt-[1px]">W</span>
          </div>
          <span className="font-display text-lg font-semibold tracking-tight">Wayfind</span>
        </Link>

        <nav className="hidden md:flex font-display items-center gap-7 text-[13px] text-white/50 font-medium">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className={`hover:text-white transition-colors ${isActive(link.href) ? 'text-white' : ''}`}>{link.label}</Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-4 ml-auto">
          <Link href="/#demo" className="text-[13px] font-display font-medium bg-accent text-white px-4 py-2 rounded-lg hover:bg-accent/80 transition-colors">
            Get Started
          </Link>
        </div>

        <button onClick={() => setOpen(!open)} className="md:hidden ml-auto text-white/60 hover:text-white transition-colors">
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
            className="md:hidden border-t border-border3/50 bg-surface px-6 py-4 space-y-3 overflow-hidden"
          >
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className={`block text-[14px] hover:text-white font-display font-medium transition-colors ${isActive(link.href) ? 'text-white' : 'text-white/50'}`}>{link.label}</Link>
            ))}
            <Link href="/#demo" onClick={() => setOpen(false)} className="block mt-4 text-center text-[13px] font-display font-medium bg-accent text-white px-4 py-2 rounded-lg hover:bg-accent/80 transition-colors">
              Get Started
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
