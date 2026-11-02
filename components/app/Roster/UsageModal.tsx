'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';

const dataClient = generateClient<Schema>();

interface UsageModalProps {
  open: boolean;
  onClose: () => void;
  ownerId: string | null;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16);
  }
}

function fmtMoney(v: number): string {
  const a = Math.abs(v);
  return `$${a.toFixed(a < 1 ? 3 : 2)}`;
}

export default function UsageModal({ open, onClose, ownerId }: UsageModalProps) {
  const [rows, setRows] = useState<Array<{
    id: string; delta?: number | null; reason?: string | null;
    balanceAfter?: number | null; createdAt?: string | null;
  }> | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open || !ownerId) return;
    let alive = true;
    setRows(null);
    setError('');
    void (async () => {
      try {
        const { data } = await dataClient.models.CreditLedger.ledgerByOwnerId({ ownerId }, { limit: 100 });
        if (!alive) return;
        const list = [...(data ?? [])].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
        setRows(list);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'Could not load usage');
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, ownerId, attempt]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const used = Math.abs((rows ?? []).reduce((sum, r) => sum + (r.delta ?? 0), 0));

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Usage"
          >
            <div className="p-5 pb-3">
              <h3 className="font-brico text-lg font-bold text-navy">Usage</h3>
              <p className="mt-1 text-sm text-heroslate">Metered API spend on this account.</p>
              <p className="mt-3 text-2xl font-bold text-navy" title="Sum of ledger entries (spend is negative)">
                {rows === null && !error ? '…' : fmtMoney(used)}
                <span className="ml-2 align-middle text-xs font-semibold text-heroslate">used</span>
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
              {rows === null && !error && <p className="py-4 text-center text-xs text-heroslate">Loading usage…</p>}
              {error && (
                <div className="py-4 text-center">
                  <p className="text-xs font-semibold text-red-600">{error}</p>
                  <button
                    onClick={() => setAttempt((a) => a + 1)}
                    className="mt-2 rounded-full bg-ice px-4 py-1.5 text-xs font-bold text-navy"
                  >
                    Retry
                  </button>
                </div>
              )}
              {rows !== null && rows.length === 0 && (
                <p className="py-4 text-center text-xs text-heroslate">No usage recorded yet.</p>
              )}
              {rows !== null && rows.length > 0 && (
                <ul className="divide-y divide-navy/5">
                  {rows.map((r) => {
                    const d = r.delta ?? 0;
                    return (
                      <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-navy">{r.reason ?? 'Usage'}</span>
                          <span className="block text-[11px] text-heroslate">{fmtDate(r.createdAt)}</span>
                        </span>
                        <span className={`shrink-0 text-sm font-bold ${d < 0 ? 'text-red-600' : 'text-[#12706f]'}`}>
                          {d < 0 ? '−' : '+'}{fmtMoney(d)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="flex justify-end p-4 pt-2">
              <button
                onClick={onClose}
                className="rounded-full bg-navy px-5 py-2 text-sm font-bold text-white hover:bg-[#1c3350]"
              >
                Done
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
