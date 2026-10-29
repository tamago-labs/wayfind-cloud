'use client';

import { useState } from 'react';
import type { MascotColor, MascotShape } from '@/components/Mascot';
import BotPanelHeader from './BotPanelHeader';
import BotPanelBody from './BotPanelBody';
import BotEditModal from './BotEditModal';

export interface BotEdits {
  name: string;
  role: string;
  color: MascotColor;
  shape: MascotShape;
}

interface BotPanelProps {
  open: boolean;
  onClose: () => void;
  botId: string | null;
  name: string;
  role: string;
  color: MascotColor;
  shape: MascotShape;
  synced: boolean;
  onSave: (edits: BotEdits) => Promise<string | null>;
}

export default function BotPanel({ open, onClose, botId, name, role, color, shape, synced, onSave }: BotPanelProps) {
  const [editOpen, setEditOpen] = useState(false);
  const v = { name, role, color, shape };

  return (
    <div
      className={`shrink-0 overflow-hidden border-navy/10 bg-ice transition-all duration-200 ${
        open ? 'fixed inset-y-0 right-0 z-30 w-80 border-l md:static' : 'w-0'
      }`}
      aria-hidden={!open}
    >
      <div className="flex h-full w-80 flex-col p-5">
        <BotPanelHeader onClose={onClose} />
        <BotPanelBody value={v} botId={botId} synced={synced} onEdit={() => setEditOpen(true)} />
      </div>
      <BotEditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={v}
        onSave={async (edits) => {
          const err = await onSave(edits);
          if (!err) onClose();
          return err;
        }}
      />
    </div>
  );
}
