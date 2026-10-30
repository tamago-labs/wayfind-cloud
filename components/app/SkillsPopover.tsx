'use client';

import { Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

interface SkillsPopoverProps {
  open: boolean;
  onClose: () => void;
  botName: string;
  onSelectSkills: () => void;
}

/** Action menu anchored to the composer's + button. One item today (Skills); more slot in later. */
export default function SkillsPopover({ open, onClose, botName, onSelectSkills }: SkillsPopoverProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
            className="absolute bottom-14 left-0 z-50 w-64 overflow-hidden rounded-2xl border border-navy/10 bg-white p-1.5 shadow-xl"
            role="menu"
            aria-label="Composer actions"
          >
            <button
              onClick={() => {
                onSelectSkills();
                onClose();
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-ice"
              role="menuitem"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-cta/10 text-cta">
                <Sparkles className="h-4 w-4" strokeWidth={2.2} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-navy">Skills</span>
                <span className="block truncate text-xs text-heroslate">Enable or disable for {botName}</span>
              </span>
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
