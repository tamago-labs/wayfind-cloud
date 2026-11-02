'use client';

import type { ReactNode } from 'react';
import { useComputer } from '@/components/app/Roster/useComputer';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-4 py-2.5 shadow-sm">
      <span className="shrink-0 font-semibold text-heroslate">{label}</span>
      {children}
    </div>
  );
}

function statusColor(status?: string | null): string {
  if (status === 'running') return 'text-[#12706f]';
  if (status === 'suspended' || status === 'provisioning') return 'text-bamber';
  return 'text-heroslate';
}

export default function TabComputer({ botId }: { botId: string | null }) {
  const { computer } = useComputer();
  const short = (v?: string | null) => (v ? `${v.slice(0, 8)}…` : '—');

  return (
    <div className="space-y-2 text-sm">
      <Row label="Status">
        <span className={`font-bold ${statusColor(computer?.provisionStatus)}`}>
          {computer?.provisionStatus ?? 'Not started'}
        </span>
      </Row>
      <Row label="Bot ID">
        <span className="max-w-[10rem] truncate font-mono text-xs text-navy">{botId ?? 'Not synced yet'}</span>
      </Row>
      <Row label="Computer">
        <span className="max-w-[10rem] truncate font-mono text-xs text-navy" title={computer?.id ?? ''}>
          {computer?.id ? short(computer.id) : '—'}
        </span>
      </Row>
      <Row label="VM">
        <span className="max-w-[10rem] truncate font-mono text-xs text-navy" title={computer?.microvmId ?? ''}>
          {computer?.microvmId ? short(computer.microvmId) : '—'}
        </span>
      </Row>
    </div>
  );
}
