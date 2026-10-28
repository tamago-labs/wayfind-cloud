'use client';

import { useState } from 'react';

const providers = ['Anthropic', 'OpenAI', 'Gemini', 'DeepSeek', 'OpenRouter', 'Custom endpoint'];

export default function Models() {
  const [pi, setPi] = useState(0);
  const [synced, setSynced] = useState<Record<number, boolean>>({});

  const custom = pi === providers.length - 1;
  const ok = !!synced[pi];

  return (
    <section id="models" className="scroll-mt-16 bg-ice px-6 py-24 font-brico text-navy">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[5fr_6fr]">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-cta">Models</p>
          <h2 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Bring your own key in under a minute.
          </h2>
          <p className="mt-5 text-lg text-heroslate">
            Every account includes Muse Glimmer from Meta, with a generous quota. Want a different
            model? Add your key from your computer&rsquo;s settings and your Bots can use it too.
          </p>
          <ol className="mt-8 space-y-3.5 text-[15px] font-semibold">
            {['Get a key from your provider', 'Paste it into the secure form', 'Sync models and pick one'].map((s, i) => (
              <li key={s} className="flex items-center gap-3">
                <b className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-navy text-white">{i + 1}</b>
                {s}
              </li>
            ))}
          </ol>
        </div>

        <div className="overflow-hidden rounded-2xl border border-navy/10 bg-white shadow-xl shadow-navy/10">
          <div className="flex items-center gap-2 border-b border-navy/10 bg-ice px-4 py-2.5">
            <i className="h-2.5 w-2.5 rounded-full bg-navy/15" />
            <i className="h-2.5 w-2.5 rounded-full bg-navy/15" />
            <i className="h-2.5 w-2.5 rounded-full bg-navy/15" />
            <span className="ml-2 text-xs font-semibold text-heroslate">Settings · Models</span>
          </div>
          <div className="grid sm:grid-cols-[180px_1fr]">
            <div role="tablist" aria-label="Providers" className="flex gap-1 overflow-x-auto border-b border-navy/10 p-3 sm:flex-col sm:border-b-0 sm:border-r">
              {providers.map((p, i) => (
                <button
                  key={p}
                  role="tab"
                  aria-selected={i === pi}
                  onClick={() => setPi(i)}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                    i === pi ? 'bg-ice text-navy' : 'text-heroslate hover:bg-ice/60 hover:text-navy'
                  }`}
                >
                  {p}
                  {synced[i] ? (
                    <span className="text-lagoon">●</span>
                  ) : null}
                </button>
              ))}
            </div>
            <div className="min-h-[280px] p-5 sm:p-7" key={pi}>
              <div>
                  <h3 className="text-xl font-extrabold">{providers[pi]}</h3>
                  <p className="mt-1 text-sm text-heroslate">
                    {custom ? 'Works with any OpenAI-, Anthropic- or Gemini-compatible API.' : `Paste the key from your ${providers[pi]} account.`}
                  </p>
                  <label className="mt-5 block text-xs font-bold uppercase tracking-wider text-heroslate">
                    {custom ? 'Base URL' : 'API key'}
                  </label>
                  <div className={`mt-1.5 rounded-xl border border-navy/10 bg-ice px-4 py-3 text-sm ${custom ? 'text-heroslate' : 'tracking-widest text-heroslate'}`}>
                    {custom ? 'https://api.example.com/v1' : '••••••••••••••••••••'}
                  </div>
                  <button
                    onClick={() => setSynced((s) => ({ ...s, [pi]: true }))}
                    className={`mt-5 rounded-full px-6 py-2.5 text-sm font-bold transition ${
                      ok ? 'bg-lagoon/15 text-[#0f7f7d]' : 'bg-cta text-white hover:bg-ctahover'
                    }`}
                  >
                    {ok ? '✓ Synced' : 'Sync models'}
                  </button>
                  <p className={`mt-4 text-sm ${ok ? 'font-semibold text-[#0f7f7d]' : 'text-heroslate'}`}>
                    {ok ? 'Models synced. Choose one for your Bots.' : 'Stored securely. Never shown in chat.'}
                  </p>
                </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
