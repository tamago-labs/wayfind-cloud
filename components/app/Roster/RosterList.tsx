'use client';

import RosterItem from './RosterItem';
import type { RosterItem as RosterItemType } from './types';

interface RosterListProps {
  items: RosterItemType[];
  cur: number;
  onSelect: (index: number) => void;
  disabled?: boolean;
}

export default function RosterList({ items, cur, onSelect, disabled = false }: RosterListProps) {
  return (
    <nav
      className={`flex-1 space-y-1 overflow-y-auto px-3 py-1 ${disabled ? 'opacity-50' : ''}`}
      aria-label="Your Bots"
      aria-disabled={disabled}
    >
      {items.map((item) => (
        <RosterItem
          key={`${item.bot.name}-${item.index}`}
          item={item}
          active={item.index === cur}
          onSelect={(i) => {
            if (!disabled) onSelect(i);
          }}
        />
      ))}
    </nav>
  );
}
