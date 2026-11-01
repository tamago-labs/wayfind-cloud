// Shared chat transport state: local :8080 vs cloud VM endpoint.
// The toggle lives in RosterFooter; the banner in AppShell and the
// request layer in lib/agent.ts all read through here so they agree.
'use client';

import { useEffect, useState } from 'react';

export const TRANSPORT_EVENT = 'wayfind:transport-changed';
export const TRANSPORT_KEY = 'wayfind-transport';
export const VM_ENDPOINT_KEY = 'wayfind-vm-endpoint';

export type Transport = 'local' | 'cloud';

export function getTransport(): Transport {
  if (typeof window === 'undefined') return 'local';
  return window.localStorage.getItem(TRANSPORT_KEY) === 'cloud' ? 'cloud' : 'local';
}

export function getVmEndpoint(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(VM_ENDPOINT_KEY);
}

export function setTransportValue(t: Transport): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TRANSPORT_KEY, t);
  window.dispatchEvent(new Event(TRANSPORT_EVENT));
}

/** Reactive transport; re-renders on toggle (same tab via event, other tabs via storage). */
export function useTransport(): [Transport, (t: Transport) => void] {
  const [t, setT] = useState<Transport>('local');
  useEffect(() => {
    setT(getTransport());
    const onChange = () => setT(getTransport());
    window.addEventListener(TRANSPORT_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(TRANSPORT_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);
  return [t, setTransportValue];
}
