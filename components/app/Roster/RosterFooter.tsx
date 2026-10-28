'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, Pencil, Settings } from 'lucide-react';
import { signOut } from 'aws-amplify/auth';

export default function RosterFooter() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    router.push('/');
  };

  return (
    <div className="relative border-t border-navy/10 p-4" ref={menuRef}>
      <p className="mb-2 flex items-center gap-1.5 text-sm text-heroslate">
        Enter your name <Pencil className="h-3 w-3" strokeWidth={2} />
      </p>
      <div className="flex items-center gap-2.5">
        <span className="relative shrink-0">
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                role="menu"
                aria-label="Profile menu"
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-full left-0 mb-1 w-52 overflow-hidden rounded-2xl border border-navy/10 bg-white py-1.5 shadow-xl shadow-navy/10"
              >
                <button
                  role="menuitem"
                  disabled
                  aria-disabled="true"
                  title="Coming soon"
                  className="flex w-full cursor-not-allowed items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-heroslate/60"
                >
                  <Settings className="h-4 w-4" strokeWidth={2.2} />
                  Settings
                  <span className="ml-auto rounded-full bg-ice px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">Soon</span>
                </button>
                <div className="mx-4 my-1 border-t border-navy/10" aria-hidden="true" />
                <button
                  role="menuitem"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-navy hover:bg-ice"
                >
                  <LogOut className="h-4 w-4" strokeWidth={2.2} />
                  Sign out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Profile menu"
            className="grid h-10 w-10 place-items-center rounded-full bg-white font-bold text-navy shadow-sm hover:bg-slate-50"
          >
            P
          </button>
        </span>
        <button className="flex flex-1 items-center justify-center gap-2.5 rounded-full bg-white py-2.5 font-semibold text-navy shadow-sm hover:bg-slate-50">
          Connectors
          <span className="flex -space-x-1" aria-hidden="true">
            <i className="grid h-5 w-5 place-items-center rounded bg-[#EA4335] text-[10px] font-bold not-italic text-white ring-2 ring-white">M</i>
            <i className="grid h-5 w-5 place-items-center rounded bg-navy text-[10px] font-bold not-italic text-white ring-2 ring-white">N</i>
            <i className="grid h-5 w-5 place-items-center rounded bg-blagoon text-[10px] font-bold not-italic text-white ring-2 ring-white">D</i>
          </span>
        </button>
      </div>
    </div>
  );
}
