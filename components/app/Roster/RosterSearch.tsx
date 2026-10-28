'use client';

interface RosterSearchProps {
  query: string;
  onQuery: (q: string) => void;
  showSearch: boolean;
}

export default function RosterSearch({ query, onQuery, showSearch }: RosterSearchProps) {
  return (
    <input
      type="search"
      value={query}
      onChange={(e) => onQuery(e.target.value)}
      placeholder="Search Bots"
      className={`mx-4 mb-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-navy outline-none placeholder:text-slate-400 ${
        showSearch ? '' : 'hidden'
      }`}
    />
  );
}
