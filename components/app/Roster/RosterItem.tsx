'use client';

import Mascot from '@/components/Mascot';
import { lastPreview } from '../seed';
import type { RosterItem } from './types';

interface RosterItemProps {
  item: RosterItem;
  active: boolean;
  onSelect: (index: number) => void;
}

export default function RosterItem({ item, active, onSelect }: RosterItemProps) {
  const { bot, index } = item;
  return (
    <button
      onClick={() => onSelect(index)}
      className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${
        active ? 'bg-white shadow-sm' : 'hover:bg-white/60'
      }`}
    >
      <Mascot
        color={bot.color}
        shape={bot.shape}
        size="md"
        motion="none"
        blinkDelay={`-${index * 1.4}s`}
        className="shrink-0"
      />
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-navy">{bot.name}</span>
        <span className="block truncate text-sm text-heroslate">{lastPreview(bot)}</span>
      </span>
      {bot.busy && (
        <i title="Working" className="animate-awake h-2.5 w-2.5 shrink-0 rounded-full bg-blagoon" />
      )}
    </button>
  );
}
