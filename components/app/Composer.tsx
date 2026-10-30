'use client';

import { useEffect, useState } from 'react';
import { Send, Mic, Plus } from 'lucide-react';
import SkillsPopover from './SkillsPopover';
import VoiceModal from './VoiceModal';

interface ComposerProps {
  botName: string;
  draft: string;
  onDraft: (v: string) => void;
  onSend: () => void;
  onVoiceSend: (text: string) => void;
  onOpenSkills: () => void;
  /** Other bots for @mentions (chief thread only). Empty = no autocomplete. */
  mentionNames?: string[];
}

/** Trailing @mention being typed, e.g. "@Re" in "ask @Re". Null when none. */
function mentionQuery(draft: string): string | null {
  const m = draft.match(/(?:^|\s)@([A-Za-z0-9_-]{0,24})$/);
  return m ? m[1] : null;
}

export default function Composer({ botName, draft, onDraft, onSend, onVoiceSend, onOpenSkills, mentionNames = [] }: ComposerProps) {
  const [plusOpen, setPlusOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);

  const q = mentionQuery(draft);
  const mentions =
    q === null || mentionNames.length === 0
      ? []
      : mentionNames.filter((n) => n.toLowerCase().startsWith(q.toLowerCase())).slice(0, 5);

  const pickMention = (name: string) => {
    onDraft(draft.replace(/@([A-Za-z0-9_-]{0,24})$/, `@${name} `));
  };

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
      <div className="relative mx-auto max-w-2xl">
        {mentions.length > 0 && (
          <div className="absolute bottom-full left-4 right-4 z-10 mb-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            {mentions.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => pickMention(n)}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-semibold text-navy hover:bg-cta/5"
              >
                <span className="text-cta">@</span>
                {n}
              </button>
            ))}
          </div>
        )}
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
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-heroslate hover:bg-slate-200"
        >
          <Plus className="h-[18px] w-[18px]" strokeWidth={2.2} />
        </button>
        <input
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && mentions.length > 0) {
              e.preventDefault();
              pickMention(mentions[0]);
            }
          }}
          autoComplete="off"
          placeholder={`Message ${botName}`}
          className="min-w-0 flex-1 bg-transparent px-1 text-[15px] text-navy outline-none placeholder:text-slate-400"
        />
        <button
          type="button"
          aria-label="Voice message"
          onClick={() => setVoiceOpen(true)}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-heroslate hover:bg-slate-200"
        >
          <Mic className="h-[18px] w-[18px]" strokeWidth={2.2} />
        </button>
        <button
          type="submit"
          aria-label="Send"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cta text-white hover:bg-ctahover"
        >
          <Send className="h-[18px] w-[18px]" strokeWidth={2.4} />
        </button>
      </form>
      </div>
      {voiceOpen && (
        <VoiceModal onVoiceSend={onVoiceSend} onClose={() => setVoiceOpen(false)} />
      )}
      <p className="mx-auto mt-2 max-w-2xl text-center text-xs text-slate-400">
        Bots ask before anything irreversible. Secrets never go in chat.
      </p>
    </div>
  );
}
