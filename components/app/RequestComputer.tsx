'use client';

import { useState } from 'react';
import Link from 'next/link';
import { requestComputer } from '@/lib/wayfind-api';

export default function RequestComputer() {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const go = async () => {
    setState('working');
    try {
      const res = await requestComputer();
      const c = res?.data;
      setState('done');
      setMessage(
        c
          ? `gatekeeper: ${c.gateStatus} — ${c.gateReason ?? 'decision recorded. see above after reload.'}`
          : 'request recorded.',
      );
    } catch (err) {
      setState('error');
      setMessage((err as Error).message);
    }
  };

  return (
    <div className="mt-5">
      <button
        onClick={go}
        disabled={state === 'working'}
        className="font-mono text-[11px] px-4 py-2.5 rounded-lg bg-white text-ink hover:bg-accent hover:text-white transition-colors disabled:opacity-50"
      >
        {state === 'working' ? 'asking the gatekeeper…' : 'request computer'}
      </button>
      {state === 'done' && <p className="font-mono text-[11px] text-accent2 mt-3 leading-relaxed">{message}</p>}
      {state === 'error' && (
        <p className="font-mono text-[11px] text-famber mt-3 leading-relaxed">
          {message} <Link href="/app/sign-in" className="underline">sign in</Link>
        </p>
      )}
    </div>
  );
}
