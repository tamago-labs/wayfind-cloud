'use client';

import RosterHeader from './RosterHeader';
import RosterSearch from './RosterSearch';
import RosterList from './RosterList';
import RosterFooter from './RosterFooter';
import type { RosterProps } from './types';

export type { RosterItem, RosterProps } from './types';

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
        <RosterHeader onToggleSearch={onToggleSearch} onNew={onNew} />
        <RosterSearch query={query} onQuery={onQuery} showSearch={showSearch} />
        <RosterList items={items} cur={cur} onSelect={onSelect} />
        <RosterFooter />
      </aside>
    </>
  );
}
