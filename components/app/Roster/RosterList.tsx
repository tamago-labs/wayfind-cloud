'use client';

import RosterItem from './RosterItem';
import type { RosterItem as RosterItemType } from './types';

interface RosterListProps {
  items: RosterItemType[];
  cur: number;
  onSelect: (index: number) => void;
}

export default function RosterList({ items, cur, onSelect }: RosterListProps) {
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-1" aria-label="Your Bots">
      {items.map((item) => (
        <RosterItem key={`${item.bot.name}-${item.index}`} item={item} active={item.index === cur} onSelect={onSelect} />
      ))}
    </nav>
  );
}
