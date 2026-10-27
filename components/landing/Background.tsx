'use client';

import { MonitorSmartphone, FolderGit2, Eye, MoonStar, ShieldCheck } from 'lucide-react';
import Section from './Section';

const items = [
  {
    icon: MonitorSmartphone,
    title: 'Browser, files, terminal',
    body: 'A real workspace, not a chat window. Your Bots use connected apps where they exist and the computer for everything else — and keep working with your laptop closed.',
  },
  {
    icon: FolderGit2,
    title: 'Shared on purpose',
    body: 'Files, browser sessions and logins are shared across your Bots, so Lagoon can hand research to Ash without you re-uploading anything. Between accounts, isolation is strict.',
  },
  {
    icon: Eye,
    title: 'Watch it. Take over when needed.',
    body: 'Open the computer panel and watch the work. For a login, passkey or CAPTCHA step only you can do, the Bot hands you the screen — you finish that step, it continues.',
  },
  {
    icon: MoonStar,
    title: 'Sleeps when idle',
    body: 'The computer suspends when no Bot is working and wakes in seconds when a message, schedule or event arrives. You pay for active minutes, never an idle machine.',
  },
];

const limits = [
  ['send / pay / sign / delete', 'approval in chat'],
  ['secrets', 'secure form — never in chat'],
  ['connector tokens', 'held by Wayfind, never the Bot'],
  ['computer', '1 per account · gated'],
  ['pause_all', 'one click'],
];

export default function Background() {
  return (
    <section id="computer" className="py-20 md:py-24 bg-cream/60 border-y border-line scroll-mt-16">
      <div className="max-w-[1200px] mx-auto px-5 md:px-8">
        <div className="grid lg:grid-cols-5 gap-10 items-start">
          <div className="lg:col-span-3">
            <Section>
              <p className="font-mono text-[12px] text-accent mb-4">the computer</p>
              <h2 className="font-display text-3xl md:text-[40px] font-bold tracking-tight text-ink leading-tight">
                Every Bot you hire works
                <br />on one computer. Yours.
              </h2>
              <p className="text-inksoft text-[15px] leading-relaxed mt-4 max-w-xl">
                All of your Bots share a single persistent cloud computer. That sharing is what
                makes handoffs effortless — and the gatekeeper creates it only once you&apos;re
                verified: one computer per account, region and abuse checks first.
              </p>
            </Section>
            <div className="grid sm:grid-cols-2 gap-5 mt-10">
              {items.map((it) => (
                <Section key={it.title}>
                  <div className="rounded-2xl border border-line bg-paper p-5 h-full">
                    <it.icon className="w-5 h-5 text-accent mb-3" />
                    <h3 className="text-[14.5px] font-display font-semibold text-ink mb-1.5">{it.title}</h3>
                    <p className="text-[13px] text-inksoft leading-relaxed">{it.body}</p>
                  </div>
                </Section>
              ))}
            </div>
          </div>

          <Section className="lg:col-span-2">
            <div className="bg-dark text-white rounded-3xl shadow-card overflow-hidden lg:sticky lg:top-24">
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                <span className="font-mono text-[11px] text-white/50">computer.status + limits.live</span>
                <span className="font-mono text-[11px] text-accent2">enforced</span>
              </div>
              <div className="px-5 py-4 space-y-3">
                {limits.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 font-mono text-[12px]">
                    <span className="text-white/45 flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-accent2 shrink-0" />
                      {k}
                    </span>
                    <span className="text-white/85 text-right">{v}</span>
                  </div>
                ))}
              </div>
              <div className="px-5 pb-5">
                <div className="rounded-xl bg-white/[0.05] border border-white/[0.07] px-4 py-3 font-mono text-[11.5px] text-white/70">
                  runs on aws lambda microvms (firecracker) · checkpoints work to storage before it sleeps ·
                  isolated from every other account
                </div>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </section>
  );
}
