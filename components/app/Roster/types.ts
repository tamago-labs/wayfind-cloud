import type { SeedBot } from '../seed';

export interface RosterItem {
  bot: SeedBot & { isChiefOfStaff?: boolean };
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
  /** Grey out + ignore selects while the cloud computer isn't ready. */
  gated?: boolean;
}
