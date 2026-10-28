'use client';

import { useEffect, useRef } from 'react';
import type { Msg, SeedBot } from './seed';

interface ThreadProps {
  bot: SeedBot;
  onApprove: (msgIndex: number, ok: boolean) => void;
}

function ApprovalCard({ msg, onOk, onNo }: { msg: Extract<Msg, { t: 'ask' }>; onOk: () => void; onNo: () => void }) {
  return (
    <div className="msg-in rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="font-bold text-navy">{msg.title}</p>
      <p className="mt-1 text-heroslate">{msg.x}</p>
      <div className="mt-3 flex items-center gap-2">
        {msg.done === undefined ? (
          <>
            <button
              onClick={onOk}
              className="rounded-full bg-navy px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#1c3350]"
            >
              {msg.ok}
            </button>
            <button
              onClick={onNo}
              className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold text-navy hover:bg-slate-50"
            >
              Not now
            </button>
          </>
        ) : (
          <span className={`text-sm font-bold ${msg.done === 'ok' ? 'text-blagoon' : 'text-slate-400'}`}>
            {msg.done === 'ok' ? '✓ Approved' : 'Declined'}
          </span>
        )}
      </div>
    </div>
  );
}

export default function Thread({ bot, onApprove }: ThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [bot]);

  return (
    <div ref={scrollRef} className="thread-scroll flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-3 text-[15px]">
        {bot.msgs.length === 0 && (
          <div className="msg-in max-w-[85%] rounded-2xl rounded-bl-sm bg-white px-4 py-2.5 text-navy shadow-sm">
            Hi, I&rsquo;m {bot.name}! Give me my job in your first message: what to do, what never to do, and what to remember.
          </div>
        )}
        {bot.msgs.map((m, i) => {
          if (m.t === 'u') {
            return (
              <div key={i} className="msg-in ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-cta px-4 py-2.5 text-white">
                {m.x}
              </div>
            );
          }
          if (m.t === 'b') {
            return (
              <div key={i} className="msg-in max-w-[85%] rounded-2xl rounded-bl-sm bg-white px-4 py-2.5 text-navy shadow-sm">
                {m.x}
              </div>
            );
          }
          if (m.t === 'tool') {
            return (
              <div key={i} className="msg-in flex items-center gap-2 px-1 text-xs font-semibold text-heroslate">
                <i className="h-1.5 w-1.5 rounded-full bg-blagoon" />
                <span>{m.x}</span>
              </div>
            );
          }
          if (m.t === 'typing') {
            return (
              <div key={i} className="msg-in w-fit rounded-2xl rounded-bl-sm bg-white px-4 py-3 shadow-sm">
                <span className="typing-dots flex gap-1">
                  <i className="h-2 w-2 rounded-full bg-slate-400" />
                  <i className="h-2 w-2 rounded-full bg-slate-400" />
                  <i className="h-2 w-2 rounded-full bg-slate-400" />
                </span>
              </div>
            );
          }
          return <ApprovalCard key={i} msg={m} onOk={() => onApprove(i, true)} onNo={() => onApprove(i, false)} />;
        })}
      </div>
    </div>
  );
}
