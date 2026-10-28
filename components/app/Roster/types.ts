import type { SeedBot } from '../seed';

export interface RosterItem {
  bot: SeedBot;
  index: number;
}

export interface RosterProps {
  items: RosterItem[];
  cur: number;
  onSelect: (index: number) => void;
  query: string;
  onQuery: (q: string) => void;
  showSearch: boolean;
  onToggleSearch: () => void;
  onNew: () => void;
  open: boolean;
  onClose: () => void;
}
