'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import Mascot, { type MascotColor, type MascotShape } from '@/components/Mascot';

export interface BotEdits {
  name: string;
  role: string;
  color: MascotColor;
  shape: MascotShape;
}

interface BotPanelProps {
  open: boolean;
  onClose: () => void;
  name: string;
  role: string;
  color: MascotColor;
  shape: MascotShape;
  synced: boolean;
  onSave: (edits: BotEdits) => Promise<string | null>;
}

const colors: MascotColor[] = ['amber', 'moss', 'lagoon', 'ash', 'blue'];
const shapes: MascotShape[] = ['blob', 'circle', 'squircle', 'pebble'];

export default function BotPanel({ open, onClose, name, role, color, shape, synced, onSave }: BotPanelProps) {
  const [draft, setDraft] = useState<BotEdits | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const v = draft ?? { name, role, color, shape };

  const save = async () => {
    const n = v.name.trim();
    if (!n || saving) return;
    setSaving(true);
    setError(null);
    const err = await onSave({ ...v, name: n });
    setSaving(false);
    if (err) {
      setError(err);
    } else {
      setDraft(null);
      onClose();
    }
  };

  return (
    <div
      className={`shrink-0 overflow-hidden border-navy/10 bg-ice transition-all duration-200 ${
        open ? 'fixed inset-y-0 right-0 z-30 w-80 border-l md:static' : 'w-0'
      }`}
      aria-hidden={!open}
    >
      <div className="flex h-full w-80 flex-col p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-navy">Bot settings</h3>
          <button
            onClick={onClose}
            aria-label="Close Bot settings"
            className="grid h-9 w-9 place-items-center rounded-full bg-white text-navy shadow-sm hover:bg-slate-50"
          >
            <X className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </div>

        <div className="mt-5 flex justify-center">
          <Mascot color={v.color} shape={v.shape} size="lg" motion="none" />
        </div>
        {!synced && (
          <p className="mt-3 rounded-xl bg-bamber/20 px-3 py-2 text-center text-xs font-semibold text-navy">
            Not synced yet — edits stay on this device.
          </p>
        )}

        <label className="mt-5 block text-xs font-bold uppercase tracking-wider text-heroslate">Name</label>
        <input
          value={v.name}
          onChange={(e) => setDraft({ ...v, name: e.target.value })}
          maxLength={40}
          className="mt-1.5 w-full rounded-xl border border-navy/15 bg-white px-4 py-2.5 text-sm text-navy outline-none focus:border-cta"
        />

        <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-heroslate">Role</label>
        <input
          value={v.role}
          onChange={(e) => setDraft({ ...v, role: e.target.value })}
          maxLength={80}
          className="mt-1.5 w-full rounded-xl border border-navy/15 bg-white px-4 py-2.5 text-sm text-navy outline-none focus:border-cta"
        />

        <p className="mt-4 text-xs font-bold uppercase tracking-wider text-heroslate">Color</p>
        <div className="mt-2 flex gap-2">
          {colors.map((c) => (
            <button
              key={c}
              onClick={() => setDraft({ ...v, color: c })}
              aria-label={`Color ${c}`}
              aria-pressed={v.color === c}
              className={`grid h-10 w-10 place-items-center rounded-full bg-white shadow-sm transition ${
                v.color === c ? 'ring-2 ring-cta ring-offset-2 ring-offset-ice' : 'hover:bg-slate-50'
              }`}
            >
              <Mascot color={c} shape="circle" size="xs" motion="none" />
            </button>
          ))}
        </div>

        <p className="mt-4 text-xs font-bold uppercase tracking-wider text-heroslate">Shape</p>
        <div className="mt-2 flex gap-2">
          {shapes.map((s) => (
            <button
              key={s}
              onClick={() => setDraft({ ...v, shape: s })}
              aria-label={`Shape ${s}`}
              aria-pressed={v.shape === s}
              className={`grid h-10 w-10 place-items-center rounded-full bg-white shadow-sm transition ${
                v.shape === s ? 'ring-2 ring-cta ring-offset-2 ring-offset-ice' : 'hover:bg-slate-50'
              }`}
            >
              <Mascot color={v.color} shape={s} size="xs" motion="none" />
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-3 text-sm font-medium text-red-600" role="alert">
            {error}
          </p>
        )}

        <button
          onClick={() => void save()}
          disabled={!v.name.trim() || saving}
          className="mt-5 rounded-full bg-navy py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
