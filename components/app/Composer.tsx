'use client';

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import SkillsPopover from './SkillsPopover';

interface ComposerProps {
  botName: string;
  draft: string;
  onDraft: (v: string) => void;
  onSend: () => void;
  onOpenSkills: () => void;
}

export default function Composer({ botName, draft, onDraft, onSend, onOpenSkills }: ComposerProps) {
  const [plusOpen, setPlusOpen] = useState(false);

  useEffect(() => {
    if (!plusOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlusOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [plusOpen]);

  return (
    <div className="px-4 pb-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
        className="relative mx-auto flex max-w-2xl items-center gap-2 rounded-full border border-slate-200 bg-white p-1.5 shadow-sm focus-within:border-cta"
      >
        <SkillsPopover
          open={plusOpen}
          onClose={() => setPlusOpen(false)}
          botName={botName}
          onSelectSkills={onOpenSkills}
        />
        <button
          type="button"
          aria-label="Composer actions"
          aria-expanded={plusOpen}
          onClick={() => setPlusOpen((o) => !o)}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-xl text-heroslate hover:bg-slate-200"
        >
          +
        </button>
        <input
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          autoComplete="off"
          placeholder={`Message ${botName}`}
          className="min-w-0 flex-1 bg-transparent px-1 text-[15px] text-navy outline-none placeholder:text-slate-400"
        />
        <button
          type="submit"
          aria-label="Send"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cta text-white hover:bg-ctahover"
        >
          <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.4} />
        </button>
      </form>
      <p className="mx-auto mt-2 max-w-2xl text-center text-xs text-slate-400">
        Bots ask before anything irreversible. Secrets never go in chat.
      </p>
    </div>
  );
}
