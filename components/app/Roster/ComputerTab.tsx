'use client';

import { Cloud, CloudOff, Loader2 } from 'lucide-react';
import type { Transport } from '@/lib/transport';

export interface ComputerInfo {
  id: string;
  provisionStatus?: string | null;
  endpoint?: string | null;
  microvmId?: string | null;
}

interface ComputerTabProps {
  computer: ComputerInfo | null;
  computerBusy: boolean;
  computerError: string;
  transport: Transport;
  setTransport: (t: Transport) => void;
  onProvision: () => void;
  onAction: (action: 'suspend' | 'resume' | 'terminate') => void;
}

export default function ComputerTab({
  computer,
  computerBusy,
  computerError,
  transport,
  setTransport,
  onProvision,
  onAction,
}: ComputerTabProps) {
  return (
    <div className="p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-navy">
          {transport === 'cloud' ? <Cloud className="h-4 w-4" /> : <CloudOff className="h-4 w-4" />}
          Computer · {computer?.provisionStatus ?? '…'}
        </span>
        <button
          onClick={() => setTransport(transport === 'cloud' ? 'local' : 'cloud')}
          title={transport === 'cloud' ? 'Chat via local :8080' : 'Chat via cloud VM'}
          className="rounded-full border border-navy/15 px-2 py-0.5 text-[11px] font-bold text-heroslate hover:border-cta hover:text-cta"
        >
          {transport === 'cloud' ? 'cloud ✓' : 'local'}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {(!computer || computer.provisionStatus === 'not_provisioned' || computer.provisionStatus === 'terminated') && (
          <button
            onClick={onProvision}
            disabled={computerBusy}
            className="rounded-full bg-navy px-3 py-1 text-xs font-bold text-white hover:bg-[#1c3350] disabled:opacity-50"
          >
            {computerBusy ? 'Starting…' : 'Start computer'}
          </button>
        )}
        {computer?.provisionStatus === 'provisioning' && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-heroslate">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Booting your computer…
          </span>
        )}
        {computer?.provisionStatus === 'running' && (
          <>
            <button
              onClick={() => onAction('suspend')}
              disabled={computerBusy}
              className="rounded-full border border-navy/15 px-3 py-1 text-xs font-bold text-navy hover:border-cta hover:text-cta disabled:opacity-50"
            >
              Suspend
            </button>
            <button
              onClick={() => onAction('terminate')}
              disabled={computerBusy}
              className="rounded-full border border-navy/15 px-3 py-1 text-xs font-bold text-heroslate hover:text-red-600 disabled:opacity-50"
            >
              Terminate
            </button>
          </>
        )}
        {computer?.provisionStatus === 'suspended' && (
          <>
            <button
              onClick={() => onAction('resume')}
              disabled={computerBusy}
              className="rounded-full bg-navy px-3 py-1 text-xs font-bold text-white hover:bg-[#1c3350] disabled:opacity-50"
            >
              Resume
            </button>
            <button
              onClick={() => onAction('terminate')}
              disabled={computerBusy}
              className="rounded-full border border-navy/15 px-3 py-1 text-xs font-bold text-heroslate hover:text-red-600 disabled:opacity-50"
            >
              Terminate
            </button>
          </>
        )}
      </div>
      {computerError && (
        <p className="mt-2 text-[11px] font-semibold text-red-600">{computerError}</p>
      )}
      {computer?.provisionStatus === 'running' && transport !== 'cloud' && (
        <p className="mt-2 text-[11px] text-heroslate">Your cloud computer is running — flip to cloud to chat with it.</p>
      )}
    </div>
  );
}
