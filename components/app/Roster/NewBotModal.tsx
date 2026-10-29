'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

interface NewBotModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<string | null>;
  taken?: string[];
}

/** Theme-flavored name pool (nature + color tokens from the landing palette). */
const NAME_POOL = [
  'Amber',
  'Moss',
  'Lagoon',
  'Ash',
  'Reef',
  'Dune',
  'Bay',
  'Kelp',
  'Fern',
  'Tide',
  'Wren',
  'Nimbus',
];

function randomName(taken: string[]): string {
  const lower = new Set(taken.map((t) => t.toLowerCase()));
  const free = NAME_POOL.filter((n) => !lower.has(n.toLowerCase()));
  const pool = free.length > 0 ? free : NAME_POOL;
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function NewBotModal({ open, onClose, onCreate, taken = [] }: NewBotModalProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(randomName(taken));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const create = async () => {
    const v = name.trim();
    if (!v || saving) return;
    setSaving(true);
    setError(null);
    const err = await onCreate(v);
    setSaving(false);
    if (err) {
      setError(err);
    } else {
      onClose();
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Name your Bot"
          >
            <div className="p-5">
              <h3 className="font-brico text-lg font-bold text-navy">Name your Bot</h3>
              <p className="mt-1 text-sm text-heroslate">Give it a name — you&rsquo;ll define its job in your first message.</p>
              <div className="mt-4 flex gap-2">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void create();
                  }}
                  placeholder="e.g. Amber"
                  maxLength={40}
                  className="min-w-0 flex-1 rounded-xl border border-navy/15 bg-ice px-4 py-2.5 text-sm text-navy outline-none placeholder:text-heroslate/60 focus:border-cta"
                />
                <button
                  type="button"
                  onClick={() => setName(randomName(taken))}
                  title="Suggest another name"
                  aria-label="Suggest another name"
                  className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl border border-navy/15 bg-ice text-lg text-navy hover:border-cta"
                >
                  🎲
                </button>
              </div>
              {error && (
                <p className="mt-2 text-sm font-medium text-red-600" role="alert">
                  {error}
                </p>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={onClose}
                  className="rounded-full px-5 py-2 text-sm font-semibold text-heroslate hover:bg-ice"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void create()}
                  disabled={!name.trim() || saving}
                  className="rounded-full bg-cta px-5 py-2 text-sm font-bold text-white hover:bg-ctahover disabled:opacity-50"
                >
                  {saving ? 'Creating…' : 'Create Bot'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
