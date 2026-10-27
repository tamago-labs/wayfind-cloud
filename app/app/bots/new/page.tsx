'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageHead, PhaseNote } from '@/components/app/ui';
import { finders } from '@/components/landing/finders';
import { createBot } from '@/lib/wayfind-api';

export default function NewBotPage() {
  const [name, setName] = useState('');
  const [finder, setFinder] = useState('inbox');
  const [job, setJob] = useState('');
  const [description, setDescription] = useState('');
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('working');
    try {
      const res = await createBot({ name, finder, job, description: description || undefined });
      setState('done');
      setMessage(`Created — ${res?.data?.name ?? name} (${res?.data?.job ?? job}). Find it in your roster after the app reads from the backend.`);
    } catch (err) {
      setState('error');
      setMessage((err as Error).message);
    }
  };

  return (
    <>
      <PageHead
        mono="bots.new"
        title="Create a Bot"
        sub="Name it, pick a Finder face, give it one primary job. You can start blank — the job can also be its first message. A focused Bot builds more useful memory than a catch-all helper."
      />

      <form onSubmit={go} className="rounded-3xl border border-line bg-cream p-6 shadow-card space-y-4 max-w-xl">
        <label className="block">
          <span className="font-mono text-[11px] text-inksoft">name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Amber"
            className="mt-1.5 w-full rounded-xl border border-line bg-paper px-4 py-3 text-[14px] text-ink outline-none focus:border-accent"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[11px] text-inksoft">finder face</span>
          <div className="flex gap-2 mt-1.5">
            {finders.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFinder(f.id)}
                className={`rounded-full ring-2 transition ${finder === f.id ? 'ring-accent' : 'ring-line opacity-60 hover:opacity-100'}`}
                title={`${f.name} — ${f.job}`}
              >
                <img src={f.img} alt={f.name} className="w-12 h-12 rounded-full object-cover" />
              </button>
            ))}
          </div>
        </label>

        <label className="block">
          <span className="font-mono text-[11px] text-inksoft">one primary job</span>
          <input
            required
            value={job}
            onChange={(e) => setJob(e.target.value)}
            placeholder="Inbox Manager"
            className="mt-1.5 w-full rounded-xl border border-line bg-paper px-4 py-3 text-[14px] text-ink outline-none focus:border-accent"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[11px] text-inksoft">the durable brief (optional — or make it the first message)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Your job is… Never… Remember this."
            className="mt-1.5 w-full rounded-xl border border-line bg-paper px-4 py-3 text-[14px] text-ink outline-none focus:border-accent resize-none"
          />
        </label>

        <button
          type="submit"
          disabled={state === 'working'}
          className="w-full text-[14px] font-display font-medium bg-ink text-white px-6 py-3 rounded-xl hover:bg-accent transition-colors disabled:opacity-50"
        >
          {state === 'working' ? 'Creating…' : 'Create Bot'}
        </button>

        {state === 'done' && <p className="font-mono text-[11px] text-[#2f6b1c] leading-relaxed">{message}</p>}
        {state === 'error' && (
          <p className="font-mono text-[11px] text-[#a33] leading-relaxed">
            {message} <Link href="/app/sign-in" className="underline">sign in</Link>
          </p>
        )}
      </form>

      <PhaseNote>
        this form calls POST /bots on your wayfind-api. before the Phase 3 deploy (or without
        sign-in) it will tell you exactly that — it never pretends a Bot was created.
      </PhaseNote>
    </>
  );
}
