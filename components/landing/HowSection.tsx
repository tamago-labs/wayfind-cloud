'use client';
import { useEffect, useRef, useState } from 'react';

const LOOP = 24000;
const TYPE_MS = 16; // ms per character for the "writing" effect

// [label, amount, stampAt, matched]
const rows: [string, string, number, boolean][] = [
  ['Cloud hosting', '$42.00', 5300, true],
  ['Office supplies', '$118.40', 5900, true],
  ['Freelancer invoice', '$640.00', 6500, false],
  ['Software subscription', '$29.00', 7100, true],
  ['Courier', '$36.50', 7700, true],
  ['Vendor invoice #118', '$310.00', 8300, false],
];

// [at, who, dotColor, text]
const chat: [number, string, string, string][] = [
  [600, 'Chief of Staff', '#F5A524', 'Month-end is here \u2014 @Finance, reconcile the March books.'],
  [2000, 'Finance', '#7BA05B', 'On it \u2014 pulling March transactions from QuickBooks\u2026'],
  [3400, 'Finance', '#7BA05B', 'Matching 6 transactions against receipts\u2026'],
  [8300, 'Finance', '#7BA05B', '2 receipts missing. I\u2019ll draft replacements.'],
  [12800, 'Finance', '#7BA05B', 'Receipt drafted \u2014 needs your review before filing.'],
  [15300, 'Chief of Staff', '#F5A524', '@you \u2014 email to Maya is drafted and needs your approval before I send.'],
];

// [t, left%, top%] cursor waypoints over the computer stage
const pathPts: [number, number, number][] = [
  [0, 80, 45], [2200, 30, 12], [4200, 72, 10], [6000, 72, 20], [8300, 60, 26],
  [9600, 42, 58], [10600, 50, 62], [11700, 60, 72], [12600, 44, 62],
  [13500, 62, 76], [14400, 76, 84], [15600, 52, 62], [17000, 60, 70],
  [19000, 78, 84], [20500, 52, 62],
];

const on = (t: number, at: number, until: number = Infinity) => t >= at && t < until;

/* A line that types itself out once the clock passes `at`. The untyped
   remainder renders invisible so the layout never shifts mid-typing. */
function TypeLine({ t, at, text }: { t: number; at: number; text: string }) {
  const n = Math.max(0, Math.min(text.length, Math.floor((t - at) / TYPE_MS)));
  if (n <= 0) return <span className="invisible">{text}</span>;
  const done = n >= text.length;
  return (
    <span>
      {text.slice(0, n)}
      {!done && <span className="animate-pulse font-bold text-blagoon">▏</span>}
      <span className="invisible">{text.slice(n)}</span>
    </span>
  );
}

export default function HowSection() {
  const [t, setT] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setT(19700); // still frame: email sent
      return;
    }
    let clock = 0;
    let seen = false;
    setT(0);
    const id = setInterval(() => {
      if (!seen || pausedRef.current) return;
      clock = (clock + 100) % LOOP;
      setT(clock);
    }, 100);
    const io = new IntersectionObserver((e) => { seen = e[0].isIntersecting; });
    if (rootRef.current) io.observe(rootRef.current);
    return () => { clearInterval(id); io.disconnect(); };
  }, []);

  // pin the chat to the latest message
  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [t]);

  const cur = [...pathPts].reverse().find((p) => p[0] <= t) ?? pathPts[0];
  const visible = chat.filter(([a]) => t >= a);
  const next = chat.find(([a]) => a > t);
  const typing = next && t >= next[0] - 600 ? next : null;

  return (
    <section id="how" className="scroll-mt-16 bg-navy px-6 py-24 font-brico text-white">
      <style>{`
        @keyframes wf-beat{0%,100%{box-shadow:0 0 0 0 rgba(43,179,177,.5)}50%{box-shadow:0 0 0 8px rgba(43,179,177,0)}}
        .wf-beat{animation:wf-beat 2.4s ease-in-out infinite}
        .wf-fade{opacity:0;transition:opacity .4s}
        .wf-fade.on{opacity:1}
        .wf-win{transform:translateY(10px) scale(.98);transition:opacity .4s,transform .4s}
        .wf-win.on{transform:none}
        @media (prefers-reduced-motion:reduce){.wf-beat{animation:none}.wf-win{transform:none}}
      `}</style>
      <div
        ref={rootRef}
        className="mx-auto max-w-4xl text-center"
        onMouseEnter={() => { pausedRef.current = true; }}
        onMouseLeave={() => { pausedRef.current = false; }}
      >
        <p className="text-sm font-bold uppercase tracking-wider text-bamber">How we make it $5</p>
        <h2 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          One cloud computer. Every Bot.
        </h2>
        <p className="mx-auto mt-5 max-w-3xl text-lg text-white/70">
          We&rsquo;re building each account&rsquo;s computer on Firecracker MicroVMs on AWS Lambda —
          one isolated, serverless computer that all your Bots share, suspending when idle.
        </p>

        <div className="mt-12 text-left">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b1626] shadow-2xl shadow-black/30 sm:grid sm:h-[520px] sm:grid-cols-[1fr_2fr]">
            {/* left: team chat */}
            <div className="flex max-h-64 flex-col border-b border-white/10 bg-white/[0.03] sm:max-h-none sm:border-b-0 sm:border-r">
              <div className="border-b border-white/10 px-4 py-2.5 text-xs font-semibold text-white/50">
                Team chat
              </div>
              <div ref={chatRef} className="flex-1 space-y-2.5 overflow-hidden px-4 py-3">
                {visible.map(([, who, c, s]) => (
                  <div key={`${who}-${s}`} className="flex items-start gap-2 text-xs leading-snug">
                    <i className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: c }} />
                    <p>
                      <b style={{ color: c }}>{who}</b>
                      <span className="text-white/85"> {s}</span>
                    </p>
                  </div>
                ))}
                {typing && (
                  <div className="flex items-center gap-2 text-xs text-white/50">
                    <i className="h-2 w-2 shrink-0 animate-pulse rounded-full" style={{ background: typing[2] }} />
                    <span className="animate-pulse">typing&hellip;</span>
                  </div>
                )}
              </div>
            </div>

            {/* right: the computer stage — receipt + email overlap the spreadsheet */}
            <div className="relative flex flex-col">
              <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-2.5">
                <i className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <i className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <i className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <span className="ml-2 text-xs font-semibold text-white/50">Bot computer</span>
                <span className="ml-auto rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold">
                  {on(t, 0, 800) && <span className="text-white/60">Waking&hellip;</span>}
                  {on(t, 800, 23000) && (
                    <span className="flex items-center gap-1.5 text-blagoon">
                      <i className="wf-beat h-1.5 w-1.5 rounded-full bg-blagoon" />Active
                    </span>
                  )}
                  {on(t, 23000) && <span className="text-white/50">Suspended</span>}
                </span>
              </div>

              <div className="relative h-[620px] sm:h-[468px]">
                {/* window 1: reconciliation (backdrop) */}
                <div className="absolute inset-x-[4%] top-[3%] rounded-xl border border-white/10 bg-white/[0.06] p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-bold">
                    <i className="h-3 w-3 rounded-full bg-bmoss" />Reconciling March books ⇄ Zoho Books
                    <span className={`wf-fade ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] ${on(t, 8900) ? 'on' : ''}`}>
                      4 matched · 2 missing
                    </span>
                  </div>
                  {rows.map(([n, a, stamp, ok]) => (
                    <div key={n} className="grid grid-cols-[1fr_auto_6.5rem] items-center gap-3 border-t border-white/10 py-2 text-xs">
                      <span className="truncate">{n}</span>
                      <span className="text-white/60">{a}</span>
                      <span className="grid [&>*]:[grid-area:1/1]">
                        <span className={`wf-fade text-white/40 ${on(t, stamp - 700, stamp) ? 'on' : ''}`}>Checking&hellip;</span>
                        <span className={`wf-fade font-bold ${ok ? 'text-blagoon' : 'text-bamber'} ${on(t, stamp) ? 'on' : ''}`}>
                          {ok ? '✓ Matched' : '! Missing'}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>

                {/* window 2: Finance writes the missing receipt (overlaps spreadsheet) */}
                <div className={`wf-fade wf-win absolute inset-x-[4%] bottom-[3%] overflow-hidden rounded-xl bg-white text-navy shadow-xl ${on(t, 8900, 15200) ? 'on' : ''}`}>
                  <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold">
                    <i className="h-3 w-3 rounded-full bg-bmoss" />Finance · receipt-freelancer-640.pdf
                    <span className={`wf-fade ml-auto rounded-full bg-blagoon/20 px-2 py-0.5 text-[10px] text-[#12706f] ${on(t, 12800, 15200) ? 'on' : ''}`}>
                      Draft ready ✓
                    </span>
                  </div>
                  <div className="space-y-2 p-4 text-[13px] leading-snug">
                    <p className="font-extrabold"><TypeLine t={t} at={9200} text="RECEIPT · Freelancer invoice — $640.00" /></p>
                    <p><TypeLine t={t} at={9800} text="Vendor: Northwind Studio · March 2026" /></p>
                    <p><TypeLine t={t} at={10400} text="Services: product photography, 2 sessions" /></p>
                    <p><TypeLine t={t} at={11000} text="Amount paid: $640.00 · Bank ref …4412" /></p>
                    <p className="font-semibold text-[#8a5a00]"><TypeLine t={t} at={11500} text="Reconstructed from bank record — needs your review." /></p>
                  </div>
                </div>

                {/* window 3: email to the accountant (covers window 2) */}
                <div className={`wf-fade wf-win absolute inset-x-[4%] bottom-[3%] overflow-hidden rounded-xl bg-white text-navy shadow-xl ${on(t, 15200) ? 'on' : ''}`}>
                  <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold">
                    <i className="h-3 w-3 rounded-full bg-bmoss" />New email 
                  </div>
                  <div className="space-y-1.5 p-4 text-[13px] leading-snug">
                      <p><b className="text-slate-500">To</b> &nbsp;Maya · Flannery &amp; Associates</p>
                      <p><b className="text-slate-500">Subject</b> &nbsp;March books ready for filing</p>
                      <p className="pt-1 text-slate-600">
                        <TypeLine t={t} at={15300} text="Hi, March reconciliation attached, plus a drafted replacement receipt for the $640 invoice (marked for your review)." />
                      </p>
                    <div className="flex flex-wrap gap-1.5 pt-1 text-[11px] font-semibold">
                      <span className="rounded-md bg-slate-100 px-2 py-1">reconciliation.xlsx</span>
                      <span className="rounded-md bg-slate-100 px-2 py-1">receipt-freelancer-640.pdf</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 pt-2">
                      <span className="grid text-[11px] font-bold [&>*]:[grid-area:1/1]">
                        <span className={`wf-fade text-[#8a5a00] ${on(t, 17000, 18800) ? 'on' : ''}`}>Waiting for your approval · external recipient</span>
                          <span className={`wf-fade text-[#12706f] ${on(t, 18800, 19500) ? 'on' : ''}`}>Approved by you</span>
                          <span className={`wf-fade text-[#12706f] ${on(t, 19500) ? 'on' : ''}`}>✓ Sent to Maya</span>
                        </span>
                        <span className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold text-white transition-all ${on(t, 19200) ? 'scale-95 bg-blagoon' : 'bg-navy'}`}>
                        Send
                      </span>
                    </div>
                  </div>
                </div>

                {/* cursor */}
                <svg
                  aria-hidden="true"
                  className="pointer-events-none absolute z-10 h-6 w-6 drop-shadow transition-[left,top] duration-[900ms] ease-in-out motion-reduce:transition-none"
                  viewBox="0 0 24 24"
                  style={{ left: `${cur[1]}%`, top: `${cur[2]}%` }}
                >
                  <path d="M4 2l16 9-7 2-3 7z" fill="#fff" stroke="#0b1626" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="absolute bottom-1.5 left-3 text-[10px] font-semibold uppercase tracking-wider text-white/30">Demo</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
