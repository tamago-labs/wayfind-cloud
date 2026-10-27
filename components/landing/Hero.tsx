'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ShieldCheck, CreditCard, MoonStar } from 'lucide-react';
import { finders } from './finders';

const hero = finders[0];

const activityLines = [
  { time: '07:12', tag: 'draft', text: 'Drafted reply to Sarah — Q3 invoice question. Held for approval.' },
  { time: '06:40', tag: 'triage', text: 'Archived 12 newsletters, flagged 1 contract deadline.' },
  { time: '06:05', tag: 'brief', text: 'Morning brief sent: 3 drafts ready, 1 needs you.' },
];

export default function Hero() {
  return (
    <section className="relative grid-bg overflow-hidden">
      <div className="max-w-[1200px] mx-auto px-5 md:px-8 pt-14 pb-16 md:pt-20 md:pb-24 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
          {/* Left */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <p className="font-mono text-[12px] text-accent font-medium mb-5">wayfind.cloud · proactive ai teammates</p>
            <h1 className="font-display text-4xl md:text-[56px] font-bold tracking-tight leading-[1.05] text-ink">
              Hire a Finder.
              <br />
              Wake up to{' '}
              <span className="bg-gradient-to-r from-accent via-zenblue to-accent2 bg-clip-text text-transparent">finished work.</span>
            </h1>
            <p className="mt-5 text-[15px] md:text-base text-inksoft leading-relaxed max-w-md">
              Create a named Bot, give it a job by messaging it, and it gets to work on your own
              cloud computer — browser, files and terminal — asking before anything irreversible.
              Like Grok Bot, but standalone and from $5.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/#create" className="text-[14px] font-display font-medium bg-ink text-white px-6 py-3 rounded-xl hover:bg-accent transition-colors shadow-card">
                Create my bot
              </Link>
              <Link href="/#jobs" className="text-[14px] font-display font-medium bg-cream text-ink px-6 py-3 rounded-xl border border-line hover:border-ink/30 transition-colors">
                Meet the Finders
              </Link>
            </div>

            <ul className="mt-8 space-y-2 text-[13px] text-inksoft">
              <li className="flex items-center gap-2"><MoonStar className="w-4 h-4 text-accent" /> Works while your laptop is closed — the computer sleeps when idle, so you never pay for idle time</li>
              <li className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-accent" /> Sends, payments and deletes always stop at an approval card in your chat</li>
              <li className="flex items-center gap-2"><CreditCard className="w-4 h-4 text-accent" /> Free in early access. No card to start. Planned from $5/mo — not $50</li>
            </ul>

            {/* Floating crew strip */}
            <div className="mt-9 flex items-end gap-3">
              {finders.map((f, i) => (
                <motion.img
                  key={f.id}
                  src={f.img}
                  alt={`${f.name} — ${f.job}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.1 }}
                  className={`rounded-full object-cover ring-4 ${f.ring} shadow-card animate-floaty ${i % 2 ? 'w-14 h-14 md:w-16 md:h-16' : 'w-16 h-16 md:w-20 md:h-20'}`}
                  style={{ animationDelay: `${i * 0.7}s` }}
                />
              ))}
              <p className="font-mono text-[11px] text-inksoft pb-2">your crew,<br />on the clock</p>
            </div>
          </motion.div>

          {/* Right — bot identity card */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }} className="relative">
            <div className="relative bg-dark text-white rounded-3xl shadow-card overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-4">
                <span className="font-mono text-[11px] text-white/50">bot.identity</span>
                <span className="font-mono text-[11px] text-accent2 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent2 animate-pulse" /> working
                </span>
              </div>

              <div className="px-5 pt-4 flex items-center gap-4">
                <img src={hero.img} alt={hero.name} className="w-20 h-20 rounded-full object-cover ring-4 ring-famber/40" />
                <div>
                  <p className="font-display text-xl font-semibold leading-tight">{hero.name}</p>
                  <p className="font-mono text-[11.5px] text-white/50 mt-1">{hero.trait} · {hero.job}</p>
                  <p className="font-mono text-[11.5px] text-white/50">computer · shared by your Bots · 1 per account</p>
                </div>
              </div>

              <div className="px-5 mt-5 grid grid-cols-2 gap-3 font-mono text-[11.5px]">
                <div className="rounded-xl bg-white/[0.05] border border-white/[0.07] p-3">
                  <p className="text-white/40 mb-1">job.brief</p>
                  <p className="text-white/85 leading-relaxed">“Triage my inbox. Draft replies. Never send without me.”</p>
                </div>
                <div className="rounded-xl bg-white/[0.05] border border-white/[0.07] p-3">
                  <p className="text-white/40 mb-1">connectors</p>
                  <p className="text-white/85">{hero.connectors.join(' · ')}</p>
                  <p className="text-white/40 mt-2 mb-1">limits.live</p>
                  <p className="text-white/85">send = approval · delete = approval</p>
                </div>
              </div>

              <div className="px-5 py-5">
                <p className="font-mono text-[11px] text-white/40 mb-2">chat.activity — illustrative</p>
                <div className="space-y-2">
                  {activityLines.map((l) => (
                    <div key={l.time} className="flex gap-3 font-mono text-[11.5px] leading-relaxed">
                      <span className="text-white/35 shrink-0">{l.time}</span>
                      <span className="text-accent2 shrink-0 w-12">{l.tag}</span>
                      <span className="text-white/70">{l.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="absolute -bottom-4 left-6 bg-cream border border-line rounded-full px-4 py-2 shadow-card font-mono text-[11px] text-inksoft flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-accent" /> approval gate is on — nothing irreversible ships alone
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
