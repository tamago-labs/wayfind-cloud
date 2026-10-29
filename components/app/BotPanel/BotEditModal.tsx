'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Mascot, { type MascotColor, type MascotShape } from '@/components/Mascot';
import type { BotEdits } from './index';

const colors: MascotColor[] = ['amber', 'moss', 'lagoon', 'ash', 'blue'];
const shapes: MascotShape[] = ['blob', 'circle', 'squircle', 'pebble'];

interface BotEditModalProps {
  open: boolean;
  onClose: () => void;
  initial: BotEdits;
  onSave: (edits: BotEdits) => Promise<string | null>;
}

export default function BotEditModal({ open, onClose, initial, onSave }: BotEditModalProps) {
  const [v, setV] = useState<BotEdits>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setV(initial);
      setError(null);
    }
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const save = async () => {
    const n = v.name.trim();
    if (!n || saving) return;
    setSaving(true);
    setError(null);
    const err = await onSave({ ...v, name: n });
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
            aria-label="Edit Bot"
          >
            <div className="p-5">
              <h3 className="font-brico text-lg font-bold text-navy">Edit Bot</h3>
              <div className="mt-4 flex justify-center">
                <Mascot color={v.color} shape={v.shape} size="lg" motion="none" />
              </div>

              <label className="mt-5 block text-xs font-bold uppercase tracking-wider text-heroslate">Name</label>
              <input
                autoFocus
                value={v.name}
                onChange={(e) => setV({ ...v, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void save();
                }}
                maxLength={40}
                className="mt-1.5 w-full rounded-xl border border-navy/15 bg-ice px-4 py-2.5 text-sm text-navy outline-none placeholder:text-heroslate/60 focus:border-cta"
              />

              <p className="mt-4 text-xs font-bold uppercase tracking-wider text-heroslate">Color</p>
              <div className="mt-2 flex gap-2">
                {colors.map((c) => (
                  <button
                    key={c}
                    onClick={() => setV({ ...v, color: c })}
                    aria-label={`Color ${c}`}
                    aria-pressed={v.color === c}
                    className={`grid h-10 w-10 place-items-center rounded-full bg-ice shadow-sm transition ${
                      v.color === c ? 'ring-2 ring-cta ring-offset-2' : 'hover:bg-slate-100'
                    }`}
                  >
                    <Mascot color={c} shape="circle" size="xs" motion="none" />
                  </button>
                ))}
              </div>

              <p className="mt-4 text-xs font-bold uppercase tracking-wider text-heroslate">Shape</p>
              <div className="mt-2 flex gap-2">
                {shapes.map((s) => (
                  <button
                    key={s}
                    onClick={() => setV({ ...v, shape: s })}
                    aria-label={`Shape ${s}`}
                    aria-pressed={v.shape === s}
                    className={`grid h-10 w-10 place-items-center rounded-full bg-ice shadow-sm transition ${
                      v.shape === s ? 'ring-2 ring-cta ring-offset-2' : 'hover:bg-slate-100'
                    }`}
                  >
                    <Mascot color={v.color} shape={s} size="xs" motion="none" />
                  </button>
                ))}
              </div>

              {error && (
                <p className="mt-3 text-sm font-medium text-red-600" role="alert">
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
                  onClick={() => void save()}
                  disabled={!v.name.trim() || saving}
                  className="rounded-full bg-cta px-5 py-2 text-sm font-bold text-white hover:bg-ctahover disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save changes'}
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
