'use client';

import { useSyncExternalStore } from 'react';
import { backendConfigured, computerAction, provisionComputer, requestComputer } from '@/lib/wayfind-api';
import { TRANSPORT_KEY, setTransportValue } from '@/lib/transport';
import type { ComputerInfo } from './ComputerTab';

interface ComputerStore {
  computer: ComputerInfo | null;
  busy: boolean;
  error: string;
}

let snap: ComputerStore = { computer: null, busy: false, error: '' };
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function set(partial: Partial<ComputerStore>): void {
  snap = { ...snap, ...partial };
  emit();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot(): ComputerStore {
  return snap;
}

/** Shared computer lifecycle: RosterFooter acts, AppShell gates. */
export function useComputer() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

type Row = {
  id?: string;
  provisionStatus?: string | null;
  endpoint?: string | null;
  microvmId?: string | null;
};

function toInfo(row: Row | null | undefined): ComputerInfo | null {
  if (!row?.id) return null;
  return {
    id: row.id,
    provisionStatus: row.provisionStatus ?? null,
    endpoint: row.endpoint ?? null,
    microvmId: row.microvmId ?? null,
  };
}

export async function refreshComputer(silent = false): Promise<void> {
  if (!backendConfigured()) return;
  if (!silent) set({ error: '' });
  try {
    const { data } = (await requestComputer()) as { data?: Row };
    set({ computer: toInfo(data) });
  } catch (err) {
    if (!silent) set({ error: err instanceof Error ? err.message : 'Computer status failed' });
  }
}

export async function runComputerOp(op: () => Promise<unknown>): Promise<void> {
  if (snap.busy) return;
  set({ busy: true, error: '' });
  try {
    const { data } = (await op()) as { data?: Row };
    if (data) set({ computer: toInfo(data) });
    else await refreshComputer(true);
  } catch (err) {
    set({ error: err instanceof Error ? err.message : 'Computer op failed' });
  } finally {
    set({ busy: false });
  }
}

// Auto-start: once per sign-in, in the background. Suspended rows are left
// alone on purpose — autoResumeEnabled wakes the VM on first traffic and the
// relay heals the row to running, so no explicit resume is needed.
let ensuredFor: string | null = null;
let lastOwnerId: string | null = null;

export function ensureComputerStart(ownerId: string): void {
  lastOwnerId = ownerId;
  if (!backendConfigured()) return;
  if (ensuredFor === ownerId) return;
  ensuredFor = ownerId;
  void (async () => {
    try {
      // New-user default: no transport choice stored yet → cloud, so the
      // first run boots a VM instead of pointing at a dead :8080.
      if (typeof window !== 'undefined' && window.localStorage.getItem(TRANSPORT_KEY) === null) {
        setTransportValue('cloud');
      }
      const { data } = (await requestComputer()) as { data?: Row };
      set({ computer: toInfo(data) });
      const st = data?.provisionStatus;
      // Respect an explicit local choice — don't bill a cloud boot the user
      // didn't ask for.
      if (typeof window !== 'undefined' && window.localStorage.getItem(TRANSPORT_KEY) !== 'cloud') return;
      if (!data || st === 'not_provisioned' || st === 'terminated') {
        await runComputerOp(provisionComputer);
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Auto-start failed' });
    }
  })();
}

/** Retry after a failed auto-start (clears the once-per-sign-in guard). */
export function retryComputerStart(): void {
  ensuredFor = null;
  if (lastOwnerId) ensureComputerStart(lastOwnerId);
}

export function resumeComputer(): Promise<void> {
  return runComputerOp(() => computerAction('resume'));
}
