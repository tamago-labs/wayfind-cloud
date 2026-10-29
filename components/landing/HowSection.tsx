'use client'; // remove if you're not on Next.js
import { useEffect, useState } from 'react';

const TAB_MS = 10000; // time each tab stays on screen
const TICK_MS = 1100; // time between cursor moves (keep close to the cursor's 1000ms transition)
const LAST = 9; // last animation step of every screen
const clamp = (n: number, a: number, b: number) => Math.min(Math.max(n, a), b);

const tabs = [
  {
    id: 'teach',
    label: 'Teach a Bot',
    title: 'Teach once. Turn it into a skill.',
    body: 'A Bot completes a task in its browser while the session is recorded. Review the recording, turn it into a reusable skill file (reorder-shoes/SKILL.md), test it, and approve it — then any Bot can run it.',
  },
  {
    id: 'backup',
    label: 'Backed up & resumable',
    title: 'It sleeps. Its work doesn\u2019t disappear.',
    body: 'The workspace syncs to encrypted storage every time the computer suspends — and whenever you ask. Snapshots are listed in your Bot panel, and restoring one is one click.',
  },
  {
    id: 'files',
    label: 'Work together',
    title: 'Multiple Bots. One shared spreadsheet.',
    body: 'Each Bot handles its part of the work while collaborating on the same spreadsheet. One shared cloud computer keeps their files and workspace in sync.',
  },
];

/* ---------- shared pieces ---------- */

function Mascot({ c, s = 28 }: { c: string; s?: number }) {
  const eye = { position: 'absolute', top: '40%', width: '11%', height: '14%', borderRadius: '50%', background: '#1b2330' } as const;
  return (
    <span className="relative inline-block shrink-0" style={{ width: s * 0.9, height: s, background: c, borderRadius: '46% 46% 36% 36%' }}>
      <i style={{ ...eye, left: '30%' }} />
      <i style={{ ...eye, right: '30%' }} />
    </span>
  );
}

function Cursor({ x, y, color = '#fff', label, ping }: { x: number | null; y: number | null; color?: string; label?: string; ping?: number | null }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-20 transition-[left,top] duration-1000 ease-in-out motion-reduce:transition-none"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {ping != null && <span key={ping} className="absolute -left-2 -top-2 h-5 w-5 animate-ping rounded-full bg-white/70 motion-reduce:hidden" />}
      <svg viewBox="0 0 24 24" className="relative h-6 w-6 drop-shadow">
        <path d="M4 2l16 9-7 2-3 7z" fill={color} stroke="#0b1626" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      {label && (
        <span className="absolute left-5 top-4 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold text-navy" style={{ background: color }}>
          {label}
        </span>
      )}
    </div>
  );
}

const tones = { rec: 'bg-red-500/20 text-red-300', on: 'bg-blagoon/20 text-blagoon', off: 'bg-white/10 text-white/50' };
const dots = { rec: 'animate-pulse bg-red-500', on: 'animate-awake bg-blagoon', off: 'bg-white/40' };

import type { ReactNode } from 'react';

function Frame({ badge, tone = 'on', cursor, ping, children }: { badge: string; tone?: keyof typeof tones; cursor?: number[] | null; ping?: number | null; children: ReactNode }) {
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0b1626] shadow-2xl shadow-black/30">
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-2.5">
        <i className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <i className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <i className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="ml-2 text-xs font-semibold text-white/50">Your Bot computer</span>
        <span className={`ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition-colors ${tones[tone]}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${dots[tone]}`} />
          {badge}
        </span>
      </div>
      <div className="relative h-[calc(100%-2.75rem)]">
        {children}
        {cursor && <Cursor x={cursor[0]} y={cursor[1]} ping={ping} />}
      </div>
    </div>
  );
}

/* ---------- 1. Teach: record a shopping task, then the Bot appears ---------- */

const shoeSteps = ['Search \u201crunning shoes\u201d', 'Open the product', 'Choose size 42', 'Add to cart'];

function TeachScreen({ tick }: { tick: number }) {
  const pts = [[24, 15], [24, 15], [30, 44], [24, 53], [42, 72], [56, 15]];
  const rec = tick <= 5;
  const done = tick >= 6;
  const shown = clamp(tick, 0, 4);
  return (
    <Frame
      badge={rec ? 'Recording' : 'Skill saved'}
      tone={rec ? 'rec' : 'on'}
      cursor={done ? null : pts[tick]}
      ping={[0, 2, 3, 4, 5].includes(tick) ? tick : null}
    >
      <div className="absolute bottom-[8%] left-[4%] top-[6%] w-[60%] rounded-xl border border-white/10 bg-white/[0.06] p-3">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded bg-white/15 text-[10px] font-bold">S</span>
          <div className="flex-1 truncate rounded-full bg-white/10 px-3 py-1 text-[11px]">
            {tick >= 1 ? 'running shoes' : <span className="text-white/35">Search the shop</span>}
          </div>
          <span className="text-[11px] font-bold">
            Cart <span className={`ml-0.5 rounded-full px-1.5 ${tick >= 4 ? 'bg-bamber text-navy' : 'bg-white/10'}`}>{tick >= 4 ? 1 : 0}</span>
          </span>
        </div>
        {tick >= 1 && tick < 3 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {['Road Flyer', 'Trail Runner 2', 'City Glide'].map((n, i) => (
              <div key={n} className={`rounded-lg border p-2 ${tick >= 2 && i === 1 ? 'border-blagoon bg-white/10' : 'border-white/10'}`}>
                <div className="h-12 rounded bg-white/10" />
                <p className="mt-2 truncate text-[10px] font-semibold">{n}</p>
              </div>
            ))}
          </div>
        )}
        {tick >= 3 && (
          <div className="mt-3 flex gap-3">
            <div className="h-24 w-2/5 rounded-lg bg-white/10" />
            <div className="flex-1 text-[11px]">
              <p className="font-bold">Trail Runner 2</p>
              <p className="text-white/60">$89</p>
              <div className="mt-2 flex gap-1.5">
                {[40, 41, 42, 43].map((s) => (
                  <span key={s} className={`rounded border px-1.5 py-0.5 ${s === 42 ? 'border-blagoon bg-blagoon/20' : 'border-white/20'}`}>{s}</span>
                ))}
              </div>
              <span className={`mt-3 inline-block rounded px-2.5 py-1 font-bold text-navy ${tick >= 4 ? 'bg-blagoon' : 'bg-bamber'}`}>
                {tick >= 4 ? 'Added \u2713' : 'Add to cart'}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="absolute right-[4%] top-[6%] w-[28%] rounded-xl border border-white/10 bg-white/[0.06] p-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-white/50">{rec ? 'Steps recorded' : 'Skill: reorder shoes'}</p>
        <ol className="mt-2 space-y-2 text-[11px]">
          {shoeSteps.map((s, i) => (
            <li key={s} className={`flex gap-2 transition-opacity duration-500 ${i < shown ? 'opacity-100' : 'opacity-0'}`}>
              <b className="text-blagoon">{i + 1}</b>
              {s}
            </li>
          ))}
        </ol>
      </div>

      <div className={`absolute bottom-[8%] right-[4%] w-[28%] transition-all duration-700 ${done ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}>
        <div className="rounded-xl bg-bamber p-3 text-navy">
          <p className="text-[10px] font-bold uppercase tracking-wide">Saved as skill</p>
          <p className="mt-0.5 text-sm font-extrabold">Reorder shoes</p>
          <p className="mt-1 font-mono text-[11px] font-medium">reorder-shoes/SKILL.md</p>
        </div>
      </div>
    </Frame>
  );
}

/* ---------- 2. Backup: suspend -> snapshot -> resume/restore ---------- */

const snapshots = [
  { n: 'snapshot · 07:02', meta: 'on suspend · 182 MB' },
  { n: 'snapshot · yesterday 18:44', meta: 'manual · 181 MB' },
  { n: 'snapshot · yesterday 07:01', meta: 'on suspend · 179 MB' },
];

function BackupScreen({ tick }: { tick: number }) {
  const phase = tick < 3 ? 'working' : tick < 5 ? 'backing' : tick < 8 ? 'asleep' : 'restored';
  const badge = { working: 'Working', backing: 'Backing up', asleep: 'Suspended · backed up', restored: 'Resumed from snapshot' }[phase];
  const shown = phase === 'working' ? 0 : phase === 'backing' ? 1 : 3;
  return (
    <Frame badge={badge} tone={phase === 'asleep' ? 'off' : 'on'}>
      <div className="absolute inset-x-[4%] top-[6%] bottom-[8%] rounded-xl border border-white/10 bg-white/[0.06] p-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wide text-white/50">Computer · workspace</p>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${phase === 'asleep' ? 'bg-white/10 text-white/50' : 'bg-blagoon/20 text-blagoon'}`}>
            {phase === 'asleep' ? 'suspended · $0' : phase === 'restored' ? 'running · restored' : 'running'}
          </span>
        </div>

        <div className="mt-3 space-y-1.5 text-[11px] font-semibold">
          {['receipts-october.xlsx', 'skills/reorder-shoes/SKILL.md', 'notes/launch-brief.md'].map((f) => (
            <div key={f} className="flex items-center justify-between rounded-lg bg-white/[0.06] px-3 py-2">
              <span className="truncate">{f}</span>
              <span className={phase === 'working' ? 'text-white/40' : 'text-blagoon'}>{phase === 'working' ? 'local' : 'backed up \u2713'}</span>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[10px] font-bold uppercase tracking-wide text-white/50">Snapshots</p>
        <div className="mt-2 space-y-1.5">
          {snapshots.map((s, i) => (
            <div
              key={s.n}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-[11px] font-semibold transition-all duration-500 ${
                i === 0 && phase === 'restored' ? 'border-bamber bg-bamber/15' : 'border-white/10 bg-white/[0.04]'
              } ${i < shown ? 'opacity-100' : 'opacity-30'}`}
            >
              <span>{s.n}<span className="ml-2 font-normal text-white/45">{s.meta}</span></span>
              <span className={i === 0 && phase === 'restored' ? 'text-bamber' : 'text-white/50'}>
                {i === 0 && phase === 'restored' ? 'restored \u2193' : 'restore'}
              </span>
            </div>
          ))}
        </div>

        <p className={`mt-3 text-[11px] font-semibold transition-opacity duration-500 ${phase === 'asleep' || phase === 'restored' ? 'opacity-100' : 'opacity-0'}`}>
          {phase === 'restored' ? 'Workspace restored \u2014 every file where the Bot left it.' : 'Idle computers cost nothing. The work is already safe.'}
        </p>
      </div>
    </Frame>
  );
}

/* ---------- 3. Three Bots working in the same file ---------- */

const cols = ['Vendor', 'Amount', 'Category', 'Receipt', 'Status'];
const rows = [
  ['Grab', '$12.40', 'Travel', '✓', 'Matched'],
  ['AWS', '$38.10', 'Software', '✓', 'Matched'],
  ['Notion', '$10.00', 'Software', '✓', 'Matched'],
  ['Figma', '$15.00', 'Design', '✓', 'Matched'],
];
// 3 Bots roam across all columns; each has its own waypoint trail (tick 0..9)
const crew = [
  { n: 'Amber', c: '#F5A524', path: [[10, 30], [30, 30], [50, 30], [70, 30], [90, 30], [70, 50], [50, 50], [30, 50], [10, 50], [30, 50]] },
  { n: 'Moss', c: '#7BA05B', path: [[10, 50], [30, 50], [50, 50], [70, 50], [90, 50], [90, 70], [70, 70], [50, 70], [30, 70], [50, 70]] },
  { n: 'Lagoon', c: '#2BB3B1', path: [[10, 70], [30, 70], [50, 70], [70, 70], [90, 70], [90, 90], [70, 90], [50, 90], [30, 90], [10, 90]] },
];

function FilesScreen({ tick }: { tick: number }) {
  const t = clamp(tick, 0, 9);
  // tick each cell first appears under a cursor — derived from the crew trails above
  const visit = [
    [0, 1, 2, 3, 4],
    [0, 1, 2, 3, 4],
    [0, 1, 2, 3, 4],
    [9, 8, 7, 6, 5],
  ];
  const filled = (r: number, c: number) => t >= visit[r - 1][c];
  return (
    <Frame badge="Live" tone="on">
      <div className="absolute inset-x-[4%] top-[6%] bottom-[18%] rounded-lg border border-white/10 bg-white/[0.05]">
        <div className="grid h-full grid-cols-5 grid-rows-5 text-[10px] sm:text-[11px]">
          {Array.from({ length: 25 }).map((_, k) => {
            const r = Math.floor(k / 5), c = k % 5;
            const head = r === 0;
            const on = !head && filled(r, c);
            return (
              <div key={k} className={`flex items-center border-b border-r border-white/10 px-2 transition-colors duration-500 ${head ? 'bg-white/10 font-bold text-white/60' : on ? 'bg-white/[0.07] font-semibold' : ''}`}>
                <span className={`truncate transition-opacity duration-500 ${head || on ? 'opacity-100' : 'opacity-0'}`}>{head ? cols[c] : rows[r - 1][c]}</span>
              </div>
            );
          })}
        </div>
        {crew.map((b) => (
          <Cursor key={b.n} color={b.c} label={b.n} x={b.path[t][0]} y={b.path[t][1]} />
        ))}
      </div>
      <div className="absolute inset-x-[4%] bottom-[5%] flex items-center justify-between text-[11px] font-semibold">
        <span className="text-white/50">receipts-october.xlsx</span>
        <span className={`rounded-full bg-blagoon/20 px-3 py-1 text-blagoon transition-opacity duration-500 ${tick >= 7 ? 'opacity-100' : 'opacity-0'}`}>4 of 4 reconciled by 3 Bots</span>
      </div>
    </Frame>
  );
}

const screens: Record<string, ({ tick }: { tick: number }) => JSX.Element> = { teach: TeachScreen, backup: BackupScreen, files: FilesScreen };

/* ---------- section ---------- */

export default function HowSection() {
  const [active, setActive] = useState(0);
  const [tick, setTick] = useState(0);

  // restart the animation on every tab change; auto-run, no pausing
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTick(LAST); // show each screen's finished state instead of animating
      return;
    }
    setTick(0);
    const t = setInterval(() => setTick((n) => Math.min(n + 1, LAST)), TICK_MS);
    const adv = setTimeout(next, TAB_MS); // timer-driven so hidden tabs still advance
    return () => { clearInterval(t); clearTimeout(adv); };
  }, [active]);

  const next = () => setActive((a) => (a + 1) % tabs.length);
  const Screen = screens[tabs[active].id];

  return (
    <section id="how" className="scroll-mt-16 bg-navy px-6 py-24 font-brico text-white">
      <style>{`
        @keyframes wf-fill{from{width:0}to{width:100%}}
        .wf-bar{animation:wf-fill ${TAB_MS}ms linear forwards}
        @media (prefers-reduced-motion:reduce){.wf-bar{animation:none;width:100%}}
      `}</style>
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-bold uppercase tracking-wider text-bamber">How we make it $5</p>
        <h2 className="mt-3 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          One cloud computer. Every Bot.
        </h2>
        <p className="mt-5 max-w-3xl text-lg text-white/70">
          We&apos;re building each account&apos;s computer on AWS Lambda MicroVMs — one isolated,
          serverless computer that all your Bots share, suspending when idle. That&apos;s how an
          always-on agent can cost $5 a month instead of $50.
        </p>
        <p className="mt-4 inline-block rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-bold text-white/60">
          Animated preview — the Computer is in development. The three screens below show the design, not a live machine.
        </p>

        <div className="mt-12 grid items-center gap-8 lg:grid-cols-[5fr_7fr]">
          <div role="tablist" aria-label="How Wayfind works" className="hidden space-y-3 md:block">
            {tabs.map((t, i) => {
              const on = i === active;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setActive(i)}
                  className={`relative block w-full overflow-hidden rounded-2xl border p-5 text-left transition ${on ? 'border-blagoon/60 bg-white/10' : 'border-white/10 bg-white/5 hover:bg-white/[0.08]'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${on ? 'animate-awake bg-blagoon text-navy' : 'bg-white/10'}`}>{i + 1}</span>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-white/50">{t.label}</p>
                      <h3 className="font-bold">{t.title}</h3>
                    </div>
                  </div>
                  {on && <p className="mt-3 text-sm text-white/70">{t.body}</p>}
                  {on && (
                    <span className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
                      <span key={active} className="wf-bar block h-full bg-blagoon" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div role="tabpanel">
            <Screen tick={tick} />
          </div>
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 md:hidden" aria-live="polite">
            <p className="text-xs font-bold uppercase tracking-wide text-white/50">{tabs[active].label}</p>
            <h3 className="mt-1 font-bold">{tabs[active].title}</h3>
            <p className="mt-2 text-sm text-white/70">{tabs[active].body}</p>
          </div>
        </div>

        </div>
    </section>
  );
}