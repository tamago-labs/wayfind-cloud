'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import Section from './Section';

const faqs = [
  { q: 'What is Wayfind Cloud?', a: 'A standalone home for AI Bots you can keep around — like Grok Bot, without needing a Cursor or SuperGrok subscription. Each Bot (we call them Finders) has a name, a face, one primary job and memory that compounds. You message it like a teammate; it works on your own cloud computer with a browser, filesystem and terminal, and keeps working while your laptop is closed.' },
  { q: 'So is this like Grok Bot?', a: 'Yes — deliberately the same shape: a roster of named Bots, chat as the interface, one shared computer per account, account-wide connected apps, skills you save and routines you schedule, group chats and approvals in the conversation. The differences are the wedge: Wayfind is standalone from $5/mo instead of bundled, built for operators outside the US-first regions, and your computer runs on AWS Lambda MicroVMs that suspend when idle.' },
  { q: 'How is this different from a chatbot?', a: 'A chatbot waits for prompts and returns text. A Finder is hired for an outcome: “done” is defined when you create the bot, it watches schedules and app events on its own (the model never polls), and it produces finished, reviewable work — drafts, lead lists, alerts, draft PRs.' },
  { q: 'What can a Finder do without asking me?', a: 'Read, research, organise and draft. Anything irreversible — sending, paying, signing, deleting — always stops at an approval card in your chat. The gate is enforced outside the computer, so the Bot cannot talk its way past it, and memory is never a safety boundary.' },
  { q: 'What is the computer, and what is the gatekeeper?', a: 'Each account gets one cloud computer, shared by all of its Bots: files, browser sessions and logins are shared between your Bots (which makes handoffs work), and isolation between accounts is strict. Before a computer is created, a gatekeeper checks: verified account, one computer per account, region capacity, and abuse limits. The computer suspends when idle and wakes on a message, schedule or event, so you never pay for an idle machine. Computer rollout is phased — see the PRD in our repo.' },
  { q: 'What do Bots remember?', a: 'Each Bot keeps its own stable preferences, role context and summaries of prior work, so it holds a role over time instead of resetting every chat. You correct memory by messaging it ("lasting rule: from now on\u2026"). Shared files and browser sessions on the computer move context between Bots. Memory is never a safety boundary — consequential actions still stop at approval.' },
  { q: 'What are skills and routines?', a: 'A skill is a saved, reusable way of doing a task: the steps, decision rules, output format and approval boundaries, captured from a task that already worked. A routine runs that work on a schedule or an event (a Slack message, a GitHub notification, a webhook) and posts the result back into chat, with run history. The morning brief is simply a default routine. Rule of thumb: automate preparation before execution.' },
  { q: 'Can Bots work together?', a: 'Yes. Put 2–6 Bots in a group chat around one outcome, assign one owner per stage with @mentions, and they coordinate in the open. Bots can also hand work to each other asynchronously while you are away — you see the handoff in the conversation instead of routing between tools yourself.' },
  { q: 'Which apps does it connect to?', a: 'On the roadmap, in build order: Slack (briefs + approvals), Gmail + Google Calendar, GitHub, web/RSS watching, Google Sheets + Notion, then Telegram. The first connector we actually ship is decided by the first job new users pick when creating a bot. All connectors use least-access scopes.' },
  { q: 'How much does it cost?', a: 'Free during early access, no card to start. Planned tiers afterwards: Starter $5/mo (1 Bot), Operator $10/mo (up to 5 Bots + group chats), Studio $20/mo (up to 15 Bots). Paid plans are not on sale yet, and existing free users will be notified before any billing starts.' },
  { q: 'Why is it cheaper than the big platforms?', a: 'Three reasons: your computer suspends when idle instead of running 24/7, affordable models handle routine work with escalation only when a task needs it, and you pay for active Bot work — not a bundled editor/chat subscription.' },
  { q: 'Can I stop a bot?', a: 'Anytime. Pause a routine, revoke a connected app, hide or delete a Bot — files and sign-ins on the shared computer are cleaned up separately, and nothing a Bot did disappears from the record while it existed.' },
  { q: 'Where is it available?', a: 'Wayfind Cloud is built for operators outside the US-first launch regions of the big agent platforms. Regional rollout is decided per region at the gatekeeper, starting with our first computer region.' },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="py-20 md:py-24 scroll-mt-16">
      <div className="max-w-3xl mx-auto px-5 md:px-8">
        <Section>
          <p className="font-mono text-[12px] text-accent text-center mb-4">faq</p>
          <h2 className="font-display text-3xl md:text-[40px] font-bold text-center tracking-tight text-ink mb-12">
            Questions people ask
          </h2>
        </Section>

        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <Section key={faq.q}>
              <div className="rounded-2xl border border-line bg-cream overflow-hidden">
                <button
                  onClick={() => setOpenIndex(openIndex === i ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="text-[14.5px] font-display font-medium text-ink">{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 text-inksoft shrink-0 transition-transform ${openIndex === i ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence initial={false}>
                  {openIndex === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      <p className="px-5 pb-5 text-[13.5px] text-inksoft leading-relaxed">{faq.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Section>
          ))}
        </div>
      </div>
    </section>
  );
}
