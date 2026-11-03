'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { docNeighbors } from './nav';

export default function DocNav() {
  const pathname = usePathname();
  const { prev, next } = docNeighbors(pathname);
  if (!prev && !next) return null;
  return (
    <nav aria-label="More docs" className="mt-12 grid gap-3 border-t border-navy/10 pt-6 sm:grid-cols-2">
      {prev ? (
        <Link
          href={prev.href}
          className="group flex items-center gap-2 rounded-2xl border border-navy/10 bg-white px-4 py-3 hover:border-cta"
        >
          <ArrowLeft className="h-4 w-4 shrink-0 text-heroslate group-hover:text-cta" />
          <span>
            <span className="block text-xs font-bold uppercase tracking-wider text-heroslate">Previous</span>
            <span className="block font-brico font-bold text-navy">{prev.label}</span>
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link
          href={next.href}
          className="group flex items-center justify-end gap-2 rounded-2xl border border-navy/10 bg-white px-4 py-3 text-right hover:border-cta"
        >
          <span>
            <span className="block text-xs font-bold uppercase tracking-wider text-heroslate">Next</span>
            <span className="block font-brico font-bold text-navy">{next.label}</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-heroslate group-hover:text-cta" />
        </Link>
      )}
    </nav>
  );
}
