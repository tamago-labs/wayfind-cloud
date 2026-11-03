import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, ExternalLink } from 'lucide-react';
import Header from '@/components/landing/Header';
import Footer from '@/components/landing/Footer';
import DetailIcon from './DetailIcon';
import { CONNECTORS, connectorSlug } from '@/lib/connectors';

const VERB_STYLE: Record<string, string> = {
  Create: 'bg-blagoon/10 text-blagoon',
  Fetch: 'bg-cta/10 text-cta',
  Find: 'bg-cta/10 text-cta',
  Update: 'bg-bamber/15 text-navy',
};

function verbOf(tool: string): string {
  return tool.split(' ')[0] ?? '';
}

export function generateStaticParams(): { slug: string }[] {
  return CONNECTORS.map((c) => ({ slug: connectorSlug(c.name) }));
}

export default function ConnectorDetailPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const c = CONNECTORS.find((k) => connectorSlug(k.name) === slug);

  if (!c) {
    return (
      <main className="min-h-screen bg-herobg font-brico text-navy">
        <Header />
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h1 className="text-3xl font-extrabold">Connector not found</h1>
          <p className="mt-3 text-heroslate">It may have been renamed — browse the full catalog.</p>
          <Link href="/connectors" className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-navy px-6 py-3 text-sm font-bold text-white hover:opacity-90">
            <ArrowLeft className="h-4 w-4" /> All connectors
          </Link>
        </div>
        <Footer />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-herobg font-brico text-navy">
      <Header />
      <div className="mx-auto max-w-3xl px-6 pb-24 pt-6">
        <Link href="/connectors" className="inline-flex items-center gap-1.5 text-sm font-bold text-heroslate hover:text-navy">
          <ArrowLeft className="h-4 w-4" /> All connectors
        </Link>

        <div className="mt-6 flex items-start gap-5">
          <DetailIcon c={c} />
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight">{c.name}</h1>
            <p className="mt-2 text-xs font-bold uppercase tracking-wider text-heroslate">
              {c.category} · {c.type}
            </p>
          </div>
        </div>
        <p className="mt-5 max-w-2xl text-lg text-heroslate">{c.description ?? c.blurb}</p>
        {c.website && (
          <a href={c.website} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-cta hover:underline">
            {c.website.replace(/^https?:\/\//, '')} <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}

        <div className="mt-10">
          <h2 className="text-xl font-extrabold">
            What your Bots can do{c.totalTools ? ` (${c.totalTools} tools)` : c.tools?.length ? ` (${c.tools.length} tools)` : ''}
          </h2>
          {c.tools?.length ? (
            <ul className="mt-4 divide-y divide-navy/5 rounded-3xl border border-navy/10 bg-white">
              {c.tools.map((t) => {
                const v = verbOf(t);
                return (
                  <li key={t} className="flex items-center gap-3 px-5 py-3">
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-extrabold ${VERB_STYLE[v] ?? 'bg-navy/5 text-heroslate'}`}>
                      {v}
                    </span>
                    <span className="text-sm font-semibold">{t}</span>
                  </li>
                );
              })}
            </ul>
          ) : c.toolGroups?.length ? (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {c.toolGroups.map((g) => (
                <li key={g.name} className="flex items-center justify-between gap-2 rounded-2xl border border-navy/10 bg-white px-4 py-3">
                  <span className="text-sm font-semibold">{g.name}</span>
                  <span className="shrink-0 rounded-full bg-navy px-2 py-0.5 text-xs font-extrabold text-white">{g.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4 rounded-3xl border border-dashed border-navy/20 bg-white p-8 text-center">
              <Check className="mx-auto h-5 w-5 text-cta" />
              <p className="mt-2 text-sm font-semibold text-heroslate">
                Tool list coming soon — ask any Bot what&apos;s possible with {c.name}.
              </p>
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-3xl bg-navy p-7 text-white sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-extrabold">Connect {c.name}</h2>
            <p className="mt-1 text-sm text-white/70">Ask any Bot in chat — it takes seconds.</p>
          </div>
          <Link href="/app" className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-cta px-6 py-3 text-sm font-bold text-white hover:bg-ctahover">
            Open the app <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
      <Footer />
    </main>
  );
}
