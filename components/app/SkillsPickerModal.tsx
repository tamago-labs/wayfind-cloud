'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { getSkills, type InstalledSkill } from '@/lib/agent';

interface SkillsPickerModalProps {
  open: boolean;
  onClose: () => void;
  botName: string;
  /** Null = all installed skills enabled. */
  enabled: string[] | null;
  onSave: (enabled: string[] | null) => void;
}

/** Per-bot skill picker: uncheck to hide a skill from this bot's prompt and block its `skill` tool. */
export default function SkillsPickerModal({ open, onClose, botName, enabled, onSave }: SkillsPickerModalProps) {
  const [skills, setSkills] = useState<InstalledSkill[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setError(null);
    getSkills()
      .then((s) => {
        if (!alive) return;
        setSkills(s);
        // Null (all enabled) checks everything; a saved list checks its names.
        setSelected(new Set(enabled ?? s.map((k) => k.name)));
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load skills.');
      });
    return () => {
      alive = false;
    };
  }, [open, enabled]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const save = () => {
    if (!skills) return;
    // All checked = "all enabled" (null) so future imports join automatically.
    onSave(selected.size === skills.length ? null : Array.from(selected));
    onClose();
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
            initial={{ scale: 0.97, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.97, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`Skills for ${botName}`}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cta" strokeWidth={2.2} />
              <h3 className="font-brico text-base font-bold text-navy">Skills for {botName}</h3>
            </div>
            <p className="mt-1 text-sm text-heroslate">
              Unchecked skills are hidden from this bot and can&apos;t be loaded. New imports join automatically
              unless you uncheck them here.
            </p>
            {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
            {!skills && !error && <p className="mt-3 text-sm text-heroslate">Loading skills…</p>}
            {skills && skills.length === 0 && (
              <p className="mt-3 text-sm text-heroslate">
                No skills installed yet — paste a link in chat or add one under Settings → Skills.
              </p>
            )}
            {skills && skills.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {skills.map((s) => (
                  <li key={s.name}>
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-navy/10 bg-ice px-3 py-2.5 hover:border-cta/40">
                      <input
                        type="checkbox"
                        checked={selected.has(s.name)}
                        onChange={() => toggle(s.name)}
                        className="mt-1 h-4 w-4 shrink-0 accent-[#2F7BFF]"
                      />
                      <span className="min-w-0">
                        <span className="block font-brico text-sm font-bold text-navy">{s.name}</span>
                        <span className="block truncate text-xs text-heroslate" title={s.description}>
                          {s.description}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-full border border-navy/15 px-4 py-1.5 text-xs font-bold text-navy hover:bg-ice"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={!skills}
                className="rounded-full bg-cta px-4 py-1.5 text-xs font-bold text-white hover:bg-ctahover disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
