'use client';

import { useCallback, useEffect, useState } from 'react';
import { deleteRoutine, listBotRoutines, setRoutineStatus, type RoutineItem } from '@/lib/routines';

function cadence(r: RoutineItem): string {
  if (r.kind === 'once') return 'Once';
  return `Repeating · ${r.cron ?? ''}`;
}

function fmtWhen(iso: string | undefined, tz?: string): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || 'UTC', day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

function Schedules({ botId, ownerId }: { botId: string; ownerId: string }) {
  const [routines, setRoutines] = useState<Array<RoutineItem & { _otherBot?: boolean }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRoutines(await listBotRoutines(ownerId, botId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedules.');
    }
  }, [ownerId, botId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onToggle = async (r: RoutineItem) => {
    if (busyId) return;
    setBusyId(r.id);
    setError(null);
    try {
      await setRoutineStatus(r.id, r.status === 'active' ? 'paused' : 'active');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toggle failed.');
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (r: RoutineItem) => {
    if (busyId) return;
    if (!window.confirm(`Delete this schedule?\n\n${r.prompt.slice(0, 120)}`)) return;
    setBusyId(r.id);
    setError(null);
    try {
      await deleteRoutine(r.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setBusyId(null);
    }
  };

  if (!routines && !error) {
    return <p className="px-1 pt-1 text-xs text-heroslate">Loading schedules…</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h4 className="text-xs font-bold uppercase tracking-wider text-heroslate">Schedules</h4>
        <button
          onClick={() => void load()}
          disabled={!!busyId}
          className="text-xs font-bold text-cta hover:text-ctahover disabled:opacity-50"
        >
          Refresh
        </button>
      </div>
      {error && <p className="px-1 text-xs font-medium text-red-600">{error}</p>}
      {routines && routines.length === 0 && (
        <p className="px-1 text-xs text-heroslate">
          No schedules yet on this account{ownerId ? ` (…${ownerId.slice(-4)})` : ''}. Ask {` `}
          this bot in chat — e.g. “remind me every weekday at 9am”.
        </p>
      )}
      {routines && routines.length > 0 && routines.every((r) => r._otherBot) && (
        <p className="rounded-xl bg-bamber/20 px-3 py-2 text-xs font-semibold text-navy">
          {routines.length} schedule{routines.length === 1 ? '' : 's'} on this account {routines.length === 1 ? 'belongs' : 'belong'} to another bot{routines[0].botId ? ` (…${routines[0].botId.slice(-4)})` : ''} — open that bot&apos;s panel to manage {routines.length === 1 ? 'it' : 'them'}. This panel is bot{botId ? ` (…${botId.slice(-4)})` : ''}.
        </p>
      )}
      {routines?.filter((r) => !r._otherBot).map((r) => (
        <div key={r.id} className="rounded-xl bg-white px-4 py-2.5 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-navy" title={r.prompt}>
                {r.name ?? r.prompt}
              </p>
              <p className="mt-0.5 text-xs text-heroslate">
                {cadence(r)} · next {fmtWhen(r.nextRunAt, r.timezone)}
                {r.lastStatus && r.lastStatus !== 'ok' ? ` · last: ${r.lastStatus}` : ''}
                {typeof r.runCount === 'number' && r.runCount > 0 ? ` · ran ${r.runCount}×` : ''}
              </p>
            </div>
            <span
              className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                r.status === 'active'
                  ? 'bg-blagoon/15 text-[#12706f]'
                  : r.status === 'done'
                    ? 'bg-navy/10 text-heroslate'
                    : 'bg-bamber/25 text-navy'
              }`}
            >
              {r.status}
            </span>
          </div>
          <div className="mt-1.5 flex gap-1.5">
            {r.status !== 'done' && (
              <button
                onClick={() => void onToggle(r)}
                disabled={busyId === r.id}
                className="rounded-full border border-navy/15 px-3 py-1 text-xs font-bold text-navy hover:bg-ice disabled:opacity-50"
              >
                {busyId === r.id ? '…' : r.status === 'active' ? 'Pause' : 'Resume'}
              </button>
            )}
            <button
              onClick={() => void onDelete(r)}
              disabled={busyId === r.id}
              className="rounded-full border border-red-200 px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {busyId === r.id ? '…' : 'Delete'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TabDetails({ botId, ownerId }: { botId: string | null; ownerId?: string }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between rounded-xl bg-white px-4 py-2.5 shadow-sm">
        <span className="font-semibold text-heroslate">Status</span>
        <span className="font-bold text-navy">Active</span>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-white px-4 py-2.5 shadow-sm">
        <span className="font-semibold text-heroslate">Bot ID</span>
        <span className="max-w-[10rem] truncate font-mono text-xs text-navy">{botId ?? 'Not synced yet'}</span>
      </div>
      {botId && ownerId ? (
        <div className="pt-1">
          <Schedules botId={botId} ownerId={ownerId} />
        </div>
      ) : (
        <p className="px-1 pt-1 text-xs text-heroslate">More details (model, memory usage) land here next.</p>
      )}
    </div>
  );
}
