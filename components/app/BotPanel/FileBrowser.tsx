'use client';

import type { ReactNode } from 'react';
import { ChevronRight, Folder, FolderOpen } from 'lucide-react';
import type { FileEntry } from '@/lib/agent';

interface FileBrowserProps {
  path: string;
  entries: FileEntry[];
  onNavigate: (path: string) => void;
  /** Rendered after the folder rows (e.g. file rows with download). */
  children?: ReactNode;
}

/** Shared breadcrumb + folder list. Hosts differ only in file rows. */
export default function FileBrowser({ path, entries, onNavigate, children }: FileBrowserProps) {
  const crumbs = path === '' ? [] : path.split('/');
  const goUp = () => {
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    onNavigate(parts.join('/'));
  };

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-navy/10 px-3 py-2 text-xs font-bold text-navy">
        <button onClick={() => onNavigate('')} className="rounded px-1 py-0.5 hover:bg-ice">
          workspace
        </button>
        {crumbs.map((c, i) => (
          <span key={`${i}-${c}`} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-heroslate" />
            <button
              onClick={() => onNavigate(crumbs.slice(0, i + 1).join('/'))}
              className="rounded px-1 py-0.5 hover:bg-ice"
            >
              {c}
            </button>
          </span>
        ))}
      </div>
      <ul className="divide-y divide-navy/5">
        {path !== '' && (
          <li>
            <button
              onClick={goUp}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-bold text-heroslate hover:bg-ice"
            >
              <FolderOpen className="h-4 w-4" /> ..
            </button>
          </li>
        )}
        {entries
          .filter((e) => e.dir)
          .map((e) => (
            <li key={e.name}>
              <button
                onClick={() => onNavigate(path === '' ? e.name : `${path}/${e.name}`)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-ice"
              >
                <Folder className="h-4 w-4 shrink-0 text-cta" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-navy">{e.name}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-heroslate" />
              </button>
            </li>
          ))}
      </ul>
      {children}
    </div>
  );
}
