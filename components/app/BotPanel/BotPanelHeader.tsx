'use client';

import { Download, X } from 'lucide-react';

export default function BotPanelHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button
        disabled
        aria-disabled="true"
        title="Export coming soon"
        aria-label="Export Bot (coming soon)"
        className="grid h-9 w-9 cursor-not-allowed place-items-center rounded-full bg-white text-heroslate/60 shadow-sm"
      >
        <Download className="h-4 w-4" strokeWidth={2.2} />
      </button>
      <button
        onClick={onClose}
        aria-label="Close Bot settings"
        className="grid h-9 w-9 place-items-center rounded-full bg-white text-navy shadow-sm hover:bg-slate-50"
      >
        <X className="h-4 w-4" strokeWidth={2.2} />
      </button>
    </div>
  );
}
