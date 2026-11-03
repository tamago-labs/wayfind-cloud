'use client';

import { useSyncExternalStore } from 'react';
import { backendConfigured, computerAction, provisionComputer, requestComputer } from '@/lib/wayfind-api';
import { TRANSPORT_KEY, VM_ENDPOINT_KEY, TRANSPORT_EVENT, setTransportValue } from '@/lib/transport';
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
  region?: string | null;
  imageVersion?: string | null;
};

function toInfo(row: Row | null | undefined): ComputerInfo | null {
  if (!row?.id) return null;
  return {
    id: row.id,
    provisionStatus: row.provisionStatus ?? null,
    endpoint: row.endpoint ?? null,
    microvmId: row.microvmId ?? null,
    region: row.region ?? null,
    imageVersion: row.imageVersion ?? null,
  };
}

export async function refreshComputer(silent = false): Promise<void> {
  if (!backendConfigured()) return;
  if (!silent) set({ error: '' });
  try {
    const { data } = (await requestComputer()) as { data?: Row };
    set({ computer: toInfo(data) });
    // Drop the dead endpoint so the banner/agent never display/use a VM
    // that no longer exists (localStorage outlives the MicroVM).
    const st = data?.provisionStatus;
    if ((st === 'not_provisioned' || st === 'terminated') && typeof window !== 'undefined') {
      window.localStorage.removeItem(VM_ENDPOINT_KEY);
      window.dispatchEvent(new Event(TRANSPORT_EVENT));
    }
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

// Auto-start: once per sign-in, in the background. Provision is
// self-healing (running → no-op, dead-but-labeled row → reset + boot), so
// it replaces the old request-then-conditional which skipped stale rows.
// Suspended rows 409 — that means usable (autoResumeEnabled wakes the VM on
// first traffic and the relay heals the row), never a failure.
let ensuredFor: string | null = null;
let lastOwnerId: string | null = null;

export function ensureComputerStart(ownerId: string): void {
  lastOwnerId = ownerId;
  if (!backendConfigured()) return;
  if (ensuredFor === ownerId) return;
  ensuredFor = ownerId;
  void (async () => {
    set({ busy: true, error: '' });
    try {
      // New-user default: no transport choice stored yet → cloud, so the
      // first run boots a VM instead of pointing at a dead :8080.
      if (typeof window !== 'undefined' && window.localStorage.getItem(TRANSPORT_KEY) === null) {
        setTransportValue('cloud');
      }
      // Respect an explicit local choice — don't bill a cloud boot the user
      // didn't ask for.
      if (typeof window !== 'undefined' && window.localStorage.getItem(TRANSPORT_KEY) !== 'cloud') {
        await refreshComputer(true);
        return;
      }
      try {
        const { data } = (await provisionComputer()) as { data?: Row };
        set({ computer: toInfo(data) });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // 409 suspended = asleep but alive; first traffic wakes it.
        if (/suspended/i.test(msg)) await refreshComputer(true);
        else throw err;
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Auto-start failed' });
    } finally {
      set({ busy: false });
    }
  })();
}

/** Retry after a failed auto-start (clears the once-per-sign-in guard). */
export function retryComputerStart(): void {
  ensuredFor = null;
  if (lastOwnerId) ensureComputerStart(lastOwnerId);
}

/** Mid-session death: the relay 410s (row already reset server-side) and
 * lib/agent.ts broadcasts `wayfind:computer-gone`. Flip immediately so the
 * UI gates instead of staying green-but-dead, then re-provision debounced —
 * history hydration fires one 410 per bot, only the first may boot.
 * A null computer (auto-start never completed) also recovers: the 410
 * already reset the server-side row, so refresh-then-provision heals it
 * instead of leaving "Setting up your computer…" forever. */
let goneTimer: ReturnType<typeof setTimeout> | null = null;

export function handleComputerGone(): void {
  if (typeof window === 'undefined') return;
  if (window.localStorage.getItem(TRANSPORT_KEY) !== 'cloud') return;
  const st = snap.computer?.provisionStatus;
  // Already recovering/booting — the normal paths own it.
  if (snap.busy || st === 'provisioning') return;
  if (snap.computer) {
    set({ computer: { ...snap.computer, provisionStatus: 'not_provisioned' }, error: '' });
  } else {
    set({ error: '' });
  }
  window.localStorage.removeItem(VM_ENDPOINT_KEY);
  window.dispatchEvent(new Event(TRANSPORT_EVENT));
  if (goneTimer) return;
  goneTimer = setTimeout(() => {
    goneTimer = null;
    const cur = snap.computer?.provisionStatus;
    if (cur === 'running' || cur === 'suspended' || snap.busy) return;
    void (async () => {
      set({ busy: true });
      try {
        // No known row (auto-start never completed): reload first — the 410
        // already reset the server-side row, so this alone often heals it.
        if (!snap.computer) await refreshComputer(true);
        const after = snap.computer?.provisionStatus;
        if (after === 'running' || after === 'suspended') return;
        const { data } = (await provisionComputer()) as { data?: Row };
        set({ computer: toInfo(data) });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/suspended/i.test(msg)) await refreshComputer(true);
        else set({ error: msg });
      } finally {
        set({ busy: false });
      }
    })();
  }, 3000);
}

export function resumeComputer(): Promise<void> {
  return runComputerOp(() => computerAction('resume'));
}
