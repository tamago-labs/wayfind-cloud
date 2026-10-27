'use client';

import { motion } from 'framer-motion';
import Section from './Section';
import { finders } from './finders';

const chat = [
  { from: 'you', text: 'Pull this week\u2019s leads. Skip anyone already contacted. Draft outreach in my voice — drafts only, by tomorrow 07:00.' },
  { from: 'moss', text: 'On it. Checking your sheet + the web. I\u2019ll stop at drafts for your approval.' },
  { from: 'tool', text: 'tool activity · sheets.read (64 rows) · web.search (12 sources) — illustrative' },
  { from: 'moss', text: 'Found 18 new matches, 6 already contacted (skipped). Top 5 researched with sources. Drafts ready:' },
  { from: 'approval', text: 'approval — send 5 outreach emails?\n[approve] [edit] [reject] · checked against: send = approval' },
];

const group = [
  { finder: finders[2], name: 'Lagoon', text: '@Lagoon gather launch sources, link every claim.' },
  { finder: finders[0], name: 'Amber', text: '@Amber turn findings into tomorrow\u2019s brief draft. Don\u2019t send anything.' },
  { finder: finders[3], name: 'Ash', text: '@Ash check the draft against the sources. List only blocking issues.' },
];

export default function HeroChatMockup() {
  return (
    <section id="chat" className="py-20 md:py-24 scroll-mt-16">
      <div className="max-w-[1200px] mx-auto px-5 md:px-8">
        <Section>
          <p className="font-mono text-[12px] text-accent text-center mb-4">messaging is the interface</p>
          <h2 className="font-display text-3xl md:text-[40px] font-bold text-center tracking-tight text-ink">
            You message a teammate.
            <br className="hidden md:block" /> It comes back with finished work.
          </h2>
          <p className="text-center text-inksoft text-[15px] max-w-xl mx-auto mt-4">
            Tool activity, files, questions and approval cards live in the same transcript.
            Add Bots to a group chat and they hand work to each other — you stop being the router.
          </p>
        </Section>

        <div className="grid lg:grid-cols-5 gap-5 mt-12">
          {/* 1:1 chat */}
          <Section className="lg:col-span-3">
            <div className="bg-cream rounded-3xl border border-line shadow-card overflow-hidden h-full">
              <div className="px-5 py-4 border-b border-line flex items-center gap-3">
                <img src={finders[1].img} alt="Moss" className="w-9 h-9 rounded-full object-cover" />
                <div>
                  <p className="text-[13.5px] font-medium text-ink leading-tight">Moss · Lead Hunter</p>
                  <p className="font-mono text-[10.5px] text-inksoft">chat — illustrative</p>
                </div>
                <span className="ml-auto font-mono text-[10.5px] px-2.5 py-1 rounded-full bg-fmoss/20 text-[#2f6b1c]">working</span>
              </div>
              <div className="px-5 py-5 space-y-3">
                {chat.map((m, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className={m.from === 'you' ? 'flex justify-end' : 'flex justify-start'}
                  >
                    {m.from === 'approval' ? (
                      <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-dark text-white px-4 py-3">
                        <p className="font-mono text-[11px] leading-relaxed whitespace-pre-line">{m.text}</p>
                      </div>
                    ) : m.from === 'tool' ? (
                      <p className="font-mono text-[10.5px] text-inksoft bg-paper border border-line rounded-full px-3 py-1.5">{m.text}</p>
                    ) : (
                      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-[12.5px] leading-relaxed ${m.from === 'you' ? 'bg-ink text-white rounded-br-sm' : 'bg-paper border border-line text-ink rounded-bl-sm'}`}>
                        {m.text}
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
              <div className="px-5 pb-5">
                <div className="rounded-xl border border-line bg-paper px-4 py-3 font-mono text-[11.5px] text-inksoft flex justify-between">
                  <span>message Moss… (@ to mention a Bot)</span>
                  <span className="text-accent">send ↑</span>
                </div>
              </div>
            </div>
          </Section>

          {/* Group chat */}
          <Section className="lg:col-span-2">
            <div className="bg-dark text-white rounded-3xl shadow-card overflow-hidden h-full">
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                <span className="font-mono text-[11px] text-white/50">group chat — launch prep</span>
                <span className="font-mono text-[11px] text-white/50">illustrative</span>
              </div>
              <div className="px-5 py-4 flex -space-x-2">
                {finders.map((f) => (
                  <img key={f.id} src={f.img} alt={f.name} className="w-9 h-9 rounded-full object-cover ring-2 ring-dark" />
                ))}
                <span className="font-mono text-[10.5px] text-white/50 self-center pl-4">2–6 Bots, one outcome</span>
              </div>
              <div className="px-5 pb-5 space-y-3">
                {group.map((g) => (
                  <div key={g.name} className="flex gap-3">
                    <img src={g.finder.img} alt={g.name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                    <p className="font-mono text-[11px] leading-relaxed text-white/70">
                      <span className="text-accent2">{g.name}</span> — {g.text}
                    </p>
                  </div>
                ))}
                <p className="font-mono text-[10.5px] text-white/35 pt-1 leading-relaxed">
                  one owner per stage. Bots can also hand work to each other while you&apos;re away —
                  you see the handoff here, not in your inbox.
                </p>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </section>
  );
}
