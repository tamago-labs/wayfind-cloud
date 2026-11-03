'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { DOC_NAV } from './nav';

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const list = (
    <nav aria-label="Docs" className="space-y-6">
      {DOC_NAV.map((section) => (
        <div key={section.title}>
          <p className="px-3 text-xs font-extrabold uppercase tracking-wider text-heroslate">{section.title}</p>
          <ul className="mt-1.5 space-y-0.5">
            {section.links.map((l) => {
              const active = pathname === l.href;
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                    className={`block rounded-lg px-3 py-1.5 text-[15px] font-medium transition-colors ${
                      active ? 'bg-navy font-bold text-white' : 'text-navy/75 hover:bg-ice hover:text-navy'
                    }`}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Mobile: collapsible section list */}
      <div className="mb-6 lg:hidden">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center justify-between rounded-xl border border-navy/15 bg-white px-4 py-2.5 text-sm font-bold text-navy"
        >
          Docs menu
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && <div className="mt-2 rounded-xl border border-navy/10 bg-white p-4">{list}</div>}
      </div>
      {/* Desktop: sticky sidebar */}
      <aside className="hidden lg:block">
        <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pb-8">{list}</div>
      </aside>
    </>
  );
}
