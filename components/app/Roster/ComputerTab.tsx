'use client';

import { useEffect, useState } from 'react';
import { Loader2, Moon } from 'lucide-react';
import { getServerStatus } from '@/lib/agent';
import type { Transport } from '@/lib/transport';
import TabHeader from './Settings/TabHeader';

export interface ComputerInfo {
  id: string;
  provisionStatus?: string | null;
  endpoint?: string | null;
  microvmId?: string | null;
  region?: string | null;
  imageVersion?: string | null;
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

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-heroslate first:mt-3">
      {children}
    </p>
  );
}

function Spec({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="shrink-0 text-xs font-semibold text-heroslate">{label}</span>
      <span className="truncate font-mono text-xs text-navy" title={title ?? value}>
        {value}
      </span>
    </div>
  );
}

function statusDot(status?: string | null): string {
  if (status === 'running') return 'bg-emerald-500';
  if (status === 'suspended' || status === 'provisioning') return 'bg-amber-500';
  return 'bg-navy/20';
}

function statusLabel(status?: string | null): string {
  if (status === 'running') return 'Running';
  if (status === 'suspended') return 'Suspended';
  if (status === 'provisioning') return 'Booting…';
  return 'Not started';
}

/** Stable service facts: our idle policy (15 min), cost model, and the
 * 8-hour session cap behind every cloud computer. */
const FACTS = [
  { icon: Moon, text: 'Sleeps after 15 min idle — wakes on your next message' },
];

export default function ComputerTab({
  computer,
  computerBusy,
  computerError,
  transport,
  setTransport,
  onProvision,
  onAction,
}: ComputerTabProps) {
  const [model, setModel] = useState<string | null>(null);

  useEffect(() => {
    if (computer?.provisionStatus !== 'running') {
      setModel(null);
      return;
    }
    let alive = true;
    getServerStatus()
      .then((s) => {
        if (alive) setModel(s.provider.model ?? null);
      })
      .catch(() => {
        if (alive) setModel(null);
      });
    return () => {
      alive = false;
    };
  }, [computer?.provisionStatus, transport]);

  const short = (v?: string | null) => (v ? `${v.slice(0, 8)}…` : '—');

  return (
    <div className="p-5">
      <TabHeader
        title="Computer"
        sub="Your Bots' always-on machine. Sleeps when idle, wakes on chat."
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-heroslate">Status</span>
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-navy">
          <i className={`h-2 w-2 rounded-full ${statusDot(computer?.provisionStatus)}`} />
          {statusLabel(computer?.provisionStatus)}
        </span>
      </div>

      {computer?.microvmId ? (
        <> 
          <div className="divide-y divide-navy/5 mt-2"> 
            <Spec
              label="OS"
              value="Firecracker"
              title="AWS Lambda Managed Instance — Firecracker MicroVM, one dedicated endpoint per computer"
            />
            <Spec label="Region" value={computer.region ?? 'ap-southeast-1'} />
            <Spec label="Image" value={`v${computer.imageVersion ?? '1.0'}`} />
            {computer.endpoint ? (
              <Spec
                label="Endpoint"
                value={`${computer.endpoint.slice(0, 24)}…`}
                title={computer.endpoint}
              />
            ) : null}
            {model ? (
              <Spec
                label="Model"
                value={(() => {
                  const base = model.split('/').pop() ?? model;
                  return base.length > 28 ? `${base.slice(0, 27)}…` : base;
                })()}
                title={model}
              />
            ) : null}
          </div>

          <SectionLabel>While you&apos;re away</SectionLabel>
          <ul className="space-y-1.5">
            {FACTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2 text-xs text-heroslate">
                <Icon className="h-3.5 w-3.5 shrink-0 text-cta" />
                {text}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-3 text-sm text-heroslate">
          Your cloud computer boots on first chat — your Bots&apos; files and memory live on it.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
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
        <button
          onClick={() => setTransport(transport === 'cloud' ? 'local' : 'cloud')}
          title={transport === 'cloud' ? 'Chat via local :8080' : 'Chat via cloud VM'}
          className="ml-auto rounded-full border border-navy/15 px-2 py-0.5 text-[11px] font-bold text-heroslate hover:border-cta hover:text-cta"
        >
          {transport === 'cloud' ? 'cloud ✓' : 'local'}
        </button>
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
