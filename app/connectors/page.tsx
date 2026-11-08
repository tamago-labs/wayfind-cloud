'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Briefcase, Megaphone, LifeBuoy, Landmark, CalendarCheck, MessagesSquare, KanbanSquare, FolderOpen, Users, Settings2, Code2, ShoppingBag, Coins, ArrowRight } from 'lucide-react';
import Header from '@/components/landing/Header';
import Footer from '@/components/landing/Footer';
import { CONNECTORS, CONNECTOR_TYPES, connectorSlug } from '@/lib/connectors';
import type { Connector, ConnectorCategory, ConnectorStatus, ConnectorTypeFilter } from '@/lib/connectors';

const TYPES: readonly ConnectorTypeFilter[] = CONNECTOR_TYPES;

const CATEGORY_ICON: Record<ConnectorCategory, typeof Briefcase> = {
  Sales: Briefcase,
  Marketing: Megaphone,
  Support: LifeBuoy,
  Finance: Landmark,
  Scheduling: CalendarCheck,
  Communication: MessagesSquare,
  Project: KanbanSquare,
  Files: FolderOpen,
  HR: Users,
  Operations: Settings2,
  Development: Code2,
  Ecommerce: ShoppingBag,
  Web3: Coins,
  Solana: Coins,
};

const STATUS_STYLE: Record<ConnectorStatus, string> = {
  Available: 'bg-blagoon/10 text-blagoon',
  'Via Zoho MCP': 'bg-cta/10 text-cta',
  'Via Web3 Gateway': 'bg-bamber/15 text-navy',
  'Coming soon': 'bg-navy/5 text-heroslate',
};

/** Brand icon with glyph fallback — a wrong producticon slug hides instead
 * of painting a broken image. */
function ConnectorIcon({ c }: { c: Connector }) {
  const [failed, setFailed] = useState(false);
  const Icon = CATEGORY_ICON[c.category];
  if (c.image && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={c.image} alt={`${c.name} icon`} onError={() => setFailed(true)} className="h-11 w-11 object-contain" loading="lazy" />;
  }
  return (
    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-ice text-cta">
      <Icon className="h-5 w-5" />
    </span>
  );
}

export default function ConnectorsPage() {
  const [cat, setCat] = useState<ConnectorTypeFilter>('Zoho-based services');
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return CONNECTORS.filter(
      (c) =>
        c.type === cat &&
        (!needle || c.name.toLowerCase().includes(needle) || c.blurb.toLowerCase().includes(needle)),
    );
  }, [cat, q]);

  return (
    <main className="min-h-screen bg-herobg font-brico text-navy">
      <Header />
      <div className="mx-auto max-w-6xl px-6 pb-24 pt-6">
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
          Connectors
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-heroslate">
          Every service your Bots can work in. Connect one from any Bot&apos;s chat, then the
          whole team can use it.
        </p>

        <div className="mt-10 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by type">
            {TYPES.map((c) => {
              const n = CONNECTORS.filter((k) => k.type === c).length;
              return (
                <button
                  key={c}
                  role="tab"
                  aria-selected={cat === c}
                  onClick={() => setCat(c)}
                  className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                    cat === c ? 'bg-navy text-white' : 'bg-ice text-navy hover:bg-navy/10'
                  }`}
                >
                  {c}{' '}
                  <span className="ml-1 rounded-full bg-navy px-2 py-0.5 text-xs font-extrabold text-white">
                    {n}
                  </span>
                </button>
              );
            })}
          </div>
          <label className="relative block lg:w-72 lg:shrink-0">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-heroslate" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search connectors…"
              aria-label="Search connectors"
              className="w-full rounded-full border border-navy/15 bg-white py-2.5 pl-10 pr-4 text-sm text-navy outline-none placeholder:text-heroslate/70 focus:border-cta"
            />
          </label>
        </div>

        {list.length > 0 ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((c) => {
              return (
                <Link
                  key={c.name}
                  href={`/connectors/${connectorSlug(c.name)}`}
                  className="flex flex-col rounded-3xl border border-navy/10 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <ConnectorIcon c={c} />
                    {c.status && (
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLE[c.status]}`}>
                        {c.status}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-4 text-xl font-extrabold">{c.name}</h2>
                  <p className="mt-1 flex-1 text-sm text-heroslate">{c.blurb}</p>
                  <p className="mt-4 text-xs font-bold uppercase tracking-wider text-heroslate">{c.category}</p>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="mt-8 rounded-3xl border border-dashed border-navy/20 p-12 text-center">
            <p className="text-lg font-bold">No connectors match “{q}”.</p>
            <p className="mt-1 text-sm text-heroslate">
              Ask any Bot to connect it from chat — most services arrive via Zoho MCP.
            </p>
          </div>
        )}

        <div className="mt-10 flex flex-col items-start justify-between gap-4 rounded-3xl bg-navy p-7 text-white sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-extrabold">Missing something?</h2>
            <p className="mt-1 text-sm text-white/70">
              Tell us which service to connect next — requested connectors land here first.
            </p>
          </div>
          <Link
            href="https://x.com/WayfindCloud"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-cta px-6 py-3 text-sm font-bold text-white hover:bg-ctahover"
          >
            Request a connector <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
      <Footer />
    </main>
  );
}
