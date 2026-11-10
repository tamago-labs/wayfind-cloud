'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AuthGate from '@/components/app/AuthGate';
import Mascot from '@/components/Mascot';
import { apiBaseUrl } from '@/lib/wayfind-api';

type Phase = 'enter' | 'working' | 'approved' | 'denied' | 'error';

async function authedFetch(path: string, body: unknown) {
  const { fetchAuthSession } = await import('aws-amplify/auth');
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error('You need to sign in first.');
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `request failed (${res.status})`);
  return data;
}

function CliLoginInner() {
  const params = useSearchParams();
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<Phase>('enter');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const preset = params.get('code');
    if (preset) setCode(preset.toUpperCase());
  }, [params]);

  const submit = async (action: 'approve' | 'deny') => {
    const clean = code.trim().toUpperCase();
    if (!clean) {
      setMessage('Enter the code shown by the CLI.');
      return;
    }
    setPhase('working');
    setMessage('');
    try {
      await authedFetch('/auth/device/approve', { code: clean, action });
      setPhase(action === 'approve' ? 'approved' : 'denied');
    } catch (err) {
      setPhase('error');
      setMessage(err instanceof Error ? err.message : 'Approval failed.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F4F7FB] px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-[0_10px_40px_rgba(14,27,44,0.12)]">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#0E1B2C]">
            <Mascot color="white" size="xs" motion="none" label="Wayfind mascot" />
          </span>
          <div>
            <div className="font-brico text-lg font-bold text-navy">Wayfind CLI login</div>
            <div className="text-sm text-[#38506B]">Approve this device to sign in your terminal.</div>
          </div>
        </div>

        {phase === 'approved' && (
          <div className="mt-6 rounded-xl bg-[#EAF6EC] p-4 text-sm text-[#1C5B26]">
            Approved. Return to your terminal — it is signing in now. You can close this tab.
          </div>
        )}
        {phase === 'denied' && (
          <div className="mt-6 rounded-xl bg-[#FDECEC] p-4 text-sm text-[#8A1F1F]">
            Denied. The terminal was not signed in. You can close this tab.
          </div>
        )}
        {(phase === 'enter' || phase === 'working' || phase === 'error') && (
          <div className="mt-6">
            <label className="text-sm font-medium text-navy" htmlFor="cli-code">
              Device code
            </label>
            <input
              id="cli-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX"
              autoComplete="off"
              spellCheck={false}
              className="mt-2 w-full rounded-xl border border-[#D6E0EC] px-4 py-3 font-mono text-lg tracking-widest text-navy outline-none focus:border-[#2F7BFF]"
            />
            {message && <div className="mt-3 text-sm text-[#8A1F1F]">{message}</div>}
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => submit('approve')}
                disabled={phase === 'working'}
                className="flex-1 rounded-xl bg-[#2F7BFF] px-4 py-3 text-sm font-semibold text-white hover:bg-[#1F63DA] disabled:opacity-50"
              >
                {phase === 'working' ? 'Working…' : 'Approve'}
              </button>
              <button
                onClick={() => submit('deny')}
                disabled={phase === 'working'}
                className="rounded-xl border border-[#D6E0EC] px-4 py-3 text-sm font-semibold text-navy hover:bg-[#F4F7FB] disabled:opacity-50"
              >
                Deny
              </button>
            </div>
            <div className="mt-4 text-xs text-[#38506B]">
              Only approve codes you generated yourself with <span className="font-mono">npx wayfind login</span>.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CliLoginPage() {
  return (
    <AuthGate>
      <Suspense>
        <CliLoginInner />
      </Suspense>
    </AuthGate>
  );
}
