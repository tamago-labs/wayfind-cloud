'use client';

import { ArrowUp } from 'lucide-react';

interface ComposerProps {
  botName: string;
  draft: string;
  onDraft: (v: string) => void;
  onSend: () => void;
}

export default function Composer({ botName, draft, onDraft, onSend }: ComposerProps) {
  return (
    <div className="px-4 pb-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
        className="mx-auto flex max-w-2xl items-center gap-2 rounded-full border border-slate-200 bg-white p-1.5 shadow-sm focus-within:border-cta"
      >
        <button
          type="button"
          aria-label="Attach"
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
