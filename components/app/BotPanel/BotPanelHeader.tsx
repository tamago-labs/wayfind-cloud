'use client';

import { Download, Trash2, X } from 'lucide-react';

export default function BotPanelHeader({ onClose, onDeleteClick }: { onClose: () => void; onDeleteClick: () => void }) {
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
        onClick={onDeleteClick}
        aria-label="Delete Bot"
        title="Delete Bot"
        className="grid h-9 w-9 place-items-center rounded-full bg-white text-red-600 shadow-sm hover:bg-red-50"
      >
        <Trash2 className="h-4 w-4" strokeWidth={2.2} />
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
