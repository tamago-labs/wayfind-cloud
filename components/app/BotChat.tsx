'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SendHorizonal, Paperclip, Monitor } from 'lucide-react';
import type { Finder } from '@/components/landing/finders';

interface Msg {
  from: 'you' | 'bot' | 'system';
  text: string;
}

export default function BotChat({ finder }: { finder: Finder }) {
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState<Msg[]>([]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setSent((prev) => [
      ...prev,
      { from: 'you', text },
      {
        from: 'system',
        text: `${finder.name} will reply here once chat goes live with the backend + model phase. This shell saves nothing and runs no work yet.`,
      },
    ]);
    setDraft('');
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)] md:min-h-[calc(100vh-5rem)]">
      {/* Chat header */}
      <div className="flex items-center gap-3 pb-4 border-b border-line">
        <img src={finder.img} alt={finder.name} className="w-11 h-11 rounded-full object-cover" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[16px] font-semibold text-ink leading-tight truncate">
            {finder.name} <span className="text-inksoft font-normal">· {finder.job}</span>
          </p>
          <p className="font-mono text-[10.5px] text-inksoft truncate">
            {finder.trait} · template — not created yet · memory starts with your first message
          </p>
        </div>
        <Link
          href={`/app/bots/${finder.id}`}
          className="font-mono text-[11px] px-3 py-2 rounded-lg border border-line bg-cream text-ink hover:border-ink/30 transition-colors shrink-0"
        >
          bot details
        </Link>
        <span className="hidden lg:flex items-center gap-2 font-mono text-[11px] px-3 py-2 rounded-lg bg-dark text-white shrink-0">
          <Monitor className="w-3.5 h-3.5" /> computer: off
        </span>
      </div>

      {/* Transcript */}
      <div className="flex-1 py-6 space-y-4">
        <div className="flex justify-start">
          <div className="max-w-[85%] md:max-w-[70%] rounded-2xl rounded-bl-sm bg-cream border border-line px-4 py-3">
            <p className="font-mono text-[10px] text-inksoft mb-1.5">starter brief — your first message could be:</p>
            <p className="text-[13px] leading-relaxed text-ink">{finder.starter}</p>
          </div>
        </div>

        <div className="flex justify-start">
          <div className="max-w-[85%] md:max-w-[70%] rounded-2xl rounded-bl-sm bg-dark text-white px-4 py-3">
            <p className="font-mono text-[10px] text-white/40 mb-1.5">approval card — how consequential work will stop here</p>
            <p className="font-mono text-[11.5px] leading-relaxed text-white/85">
              send / pay / sign / delete → held for [approve] [edit] [reject]
            </p>
          </div>
        </div>

        {sent.map((m, i) =>
          m.from === 'system' ? (
            <p key={i} className="font-mono text-[10.5px] text-inksoft text-center max-w-lg mx-auto leading-relaxed">
              {m.text}
            </p>
          ) : (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] md:max-w-[70%] rounded-2xl rounded-br-sm bg-ink text-white px-4 py-3 text-[13px] leading-relaxed">
                {m.text}
              </div>
            </div>
          ),
        )}

        {sent.length === 0 && (
          <p className="font-mono text-[10.5px] text-inksoft text-center pt-2">
            preview only — nothing here is stored, sent or worked on yet
          </p>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-line pt-4">
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-cream px-3 py-2 focus-within:border-accent transition-colors">
          <button className="p-2 text-inksoft hover:text-ink" aria-label="Attach (coming with chat)">
            <Paperclip className="w-4 h-4" />
          </button>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={`Message ${finder.name}… (@ to mention another Bot)`}
            className="flex-1 bg-transparent resize-none outline-none text-[13.5px] text-ink placeholder:text-inksoft/60 py-2 max-h-32"
          />
          <button
            onClick={send}
            className="p-2.5 rounded-xl bg-ink text-white hover:bg-accent transition-colors"
            aria-label="Send"
          >
            <SendHorizonal className="w-4 h-4" />
          </button>
        </div>
        <p className="font-mono text-[10px] text-inksoft mt-2">
          tell {finder.name} a lasting rule and it remembers · “stop now” stops work · secrets go in a secure form, never here
        </p>
      </div>
    </div>
  );
}
