'use client';

import { Search, Plus, Pencil } from 'lucide-react';
import { Logo } from '@/components/landing/Header';
import Mascot from '@/components/Mascot';
import { lastPreview, type SeedBot } from './seed';

export interface RosterItem {
  bot: SeedBot;
  index: number;
}

interface RosterProps {
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

export default function Roster({
  items,
  cur,
  onSelect,
  query,
  onQuery,
  showSearch,
  onToggleSearch,
  onNew,
  open,
  onClose,
}: RosterProps) {
  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-20 bg-navy/40 md:hidden ${open ? '' : 'hidden'}`}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[19rem] flex-col border-r border-navy/10 bg-ice transition-transform md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 pb-3 pt-4">
          <Logo />
          <div className="flex gap-2">
            <button
              onClick={onToggleSearch}
              aria-label="Search Bots"
              className="grid h-9 w-9 place-items-center rounded-full bg-white text-navy shadow-sm hover:bg-slate-50"
            >
              <Search className="h-4 w-4" strokeWidth={2.2} />
            </button>
            <button
              onClick={onNew}
              aria-label="New Bot"
              className="grid h-9 w-9 place-items-center rounded-full bg-white text-navy shadow-sm hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" strokeWidth={2.2} />
            </button>
          </div>
        </div>

        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search Bots"
          className={`mx-4 mb-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-navy outline-none placeholder:text-slate-400 ${
            showSearch ? '' : 'hidden'
          }`}
        />

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-1" aria-label="Your Bots">
          {items.map(({ bot, index }) => (
            <button
              key={`${bot.name}-${index}`}
              onClick={() => onSelect(index)}
              className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${
                index === cur ? 'bg-white shadow-sm' : 'hover:bg-white/60'
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
          ))}
        </nav>

        <div className="border-t border-navy/10 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm text-heroslate">
            Enter your name <Pencil className="h-3 w-3" strokeWidth={2} />
          </p>
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white font-bold text-navy shadow-sm">
              P
            </span>
            <button className="flex flex-1 items-center justify-center gap-2.5 rounded-full bg-white py-2.5 font-semibold text-navy shadow-sm hover:bg-slate-50">
              Connect apps
              <span className="flex -space-x-1" aria-hidden="true">
                <i className="grid h-5 w-5 place-items-center rounded bg-[#EA4335] text-[10px] font-bold not-italic text-white ring-2 ring-white">M</i>
                <i className="grid h-5 w-5 place-items-center rounded bg-navy text-[10px] font-bold not-italic text-white ring-2 ring-white">N</i>
                <i className="grid h-5 w-5 place-items-center rounded bg-blagoon text-[10px] font-bold not-italic text-white ring-2 ring-white">D</i>
              </span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
