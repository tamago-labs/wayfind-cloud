'use client';

import { useState } from 'react';
import type { Connector } from '@/lib/connectors';

/** Brand icon with glyph fallback — same treatment as the catalog cards. */
export default function DetailIcon({ c }: { c: Connector }) {
  const [failed, setFailed] = useState(false);
  if (c.image && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={c.image} alt={`${c.name} icon`} onError={() => setFailed(true)} className="h-20 w-20 object-contain" loading="lazy" />;
  }
  return <span className="grid h-20 w-20 place-items-center rounded-3xl bg-ice text-3xl font-extrabold text-cta">{c.name.charAt(0)}</span>;
}
