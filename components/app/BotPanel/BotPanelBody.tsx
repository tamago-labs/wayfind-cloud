'use client';

import Mascot from '@/components/Mascot';
import BotPanelTabs from './BotPanelTabs';
import type { BotEdits } from './index';

interface BotPanelBodyProps {
  value: BotEdits;
  botId: string | null;
  synced: boolean;
  onEdit: () => void;
}

export default function BotPanelBody({ value: v, botId, synced, onEdit }: BotPanelBodyProps) {
  return (
    <>
      <button
        onClick={onEdit}
        aria-label="Edit Bot appearance"
        title="Edit name, color and shape"
        className="mx-auto mt-5 rounded-full transition hover:opacity-80"
      >
        <Mascot color={v.color} shape={v.shape} size="lg" motion="none" />
      </button>
      {!synced && (
        <p className="mt-3 rounded-xl bg-bamber/20 px-3 py-2 text-center text-xs font-semibold text-navy">
          Not synced yet — edits stay on this device.
        </p>
      )}

      <p className="mt-5 truncate text-center text-lg font-bold text-navy">
        {v.name} <span className="text-sm font-medium text-heroslate">· {v.role}</span>
      </p>
      <BotPanelTabs botId={botId} />
    </>
  );
}
