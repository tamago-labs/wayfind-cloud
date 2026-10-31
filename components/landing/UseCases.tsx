'use client';

import { useRef, useState } from 'react';
import { ClipboardCheck, Mail, Wallet, Megaphone, FolderKanban, ShieldCheck, type LucideIcon } from 'lucide-react';

const cases: { icon: LucideIcon; title: string; body: string; get: string; tag?: string }[] = [
  {
    icon: ClipboardCheck,
    title: 'Reconcile expenses',
    body: 'Match bank transactions with invoices and receipts — and flag exactly what\u2019s missing.',
    get: 'Reconciliation report',
  },
  {
    icon: Mail,
    title: 'Chase unpaid invoices',
    body: 'Follow up with vendors and clients on outstanding bills until they\u2019re settled.',
    get: 'Follow-ups sent · paid status',
  },
  {
    icon: Wallet,
    title: 'Run payroll admin',
    body: 'Prepare payslips and expense reports from approved data, ready for your review.',
    get: 'Payslips + expense report',
  },
  {
    icon: Megaphone,
    title: 'Announce things',
    body: 'Draft the press release, the social posts, and the branded infographic for your launch.',
    get: 'Press release, posts & infographic',
  },
  {
    icon: FolderKanban,
    title: 'Organize the paperwork',
    body: 'Sort documents, pull the numbers together, and prepare reports your accountant can use.',
    get: 'Audit-ready files',
  },
  {
    icon: ShieldCheck,
    title: 'Watch the treasury',
    body: 'Monitor wallet balances and prepare stablecoin payments with explicit approval.',
    get: 'Treasury report',
    tag: 'Web3',
  },
];

export default function UseCases() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);

  const onScroll = () => {
    const el = trackRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    setIdx(Math.round((el.scrollLeft / (el.scrollWidth - el.clientWidth)) * (cases.length - 1)));
  };

  const go = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: (i / (cases.length - 1)) * (el.scrollWidth - el.clientWidth), behavior: 'smooth' });
  };

  return (
    <section id="usecases" className="scroll-mt-16 bg-ice px-6 py-24 font-brico text-navy">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-bold uppercase tracking-wider text-cta">Use cases</p>
        <h2 className="mt-3 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          Real business work, done.
        </h2>
        <p className="mt-5 max-w-3xl text-lg text-heroslate">
          The recurring jobs that eat a small business week — give each one to a Bot and get the
          finished result, not another chat thread.
        </p>
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2 [scrollbar-width:none] md:grid md:grid-cols-3 md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden"
        >
          {cases.map((c) => (
            <article key={c.title} className="flex min-w-[85%] snap-center flex-col rounded-3xl bg-white p-7 shadow-sm sm:min-w-[60%] md:min-w-0">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ice text-cta">
                <c.icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-xl font-bold">{c.title}</h3>
              <p className="mt-2 flex-1 text-heroslate">{c.body}</p>
             {/* <p className="mt-6 flex flex-wrap gap-2 border-t border-navy/10 pt-4">
                <span className="rounded-full bg-ice px-3 py-1 text-xs font-bold text-cta">{c.get}</span>
                {c.tag && <span className="rounded-full bg-ice px-3 py-1 text-xs font-bold text-cta">{c.tag}</span>}
              </p>*/}
            </article>
          ))}
        </div>
        <div className="mt-4 flex justify-center gap-2 md:hidden" role="tablist" aria-label="Use case cards">
          {cases.map((c, i) => (
            <button
              key={c.title}
              role="tab"
              aria-selected={i === idx}
              aria-label={`Show: ${c.title}`}
              onClick={() => go(i)}
              className={`h-2 rounded-full transition-all ${i === idx ? 'w-6 bg-cta' : 'w-2 bg-navy/20'}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
