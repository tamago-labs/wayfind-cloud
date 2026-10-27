'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import Section from './Section';
import { finders, jobOptions } from './finders';

export default function CTA() {
  const [email, setEmail] = useState('');
  const [job, setJob] = useState('inbox');
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onPick = (e: Event) => setJob((e as CustomEvent<string>).detail);
    window.addEventListener('wayfind:pick-job', onPick);
    return () => window.removeEventListener('wayfind:pick-job', onPick);
  }, []);

  const finder = finders.find((f) => f.id === job) ?? finders[0];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) return;
    setDone(true);
  };

  return (
    <section id="create" className="py-20 md:py-24 scroll-mt-16 grid-bg">
      <div className="max-w-3xl mx-auto px-5 md:px-8">
        <Section>
          <div className="relative bg-cream rounded-[28px] border border-line shadow-card p-6 md:p-10 overflow-hidden">
            <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-accent/10 blur-2xl pointer-events-none" />

            <div className="relative flex items-start gap-4">
              <img src={finder.img} alt={finder.name} className="w-16 h-16 md:w-20 md:h-20 rounded-full object-cover ring-4 ring-line shrink-0" />
              <div>
                <p className="font-mono text-[11px] text-accent">create my bot</p>
                <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-ink mt-1">
                  Take {finder.name} home
                </h2>
                <p className="text-[13.5px] text-inksoft leading-relaxed mt-2 max-w-md">
                  Free in early access. No card. Your computer is created only after the
                  gatekeeper check — one per account, region capacity permitting.
                </p>
              </div>
            </div>

            {done ? (
              <div className="relative mt-8 rounded-2xl bg-accent2/10 border border-accent2/30 p-5 flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-accent2 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[14px] font-display font-medium text-ink">
                    {finder.name} is on your list — {finder.job}, queued for the gatekeeper.
                  </p>
                  <p className="font-mono text-[11px] text-inksoft mt-2 leading-relaxed">
                    early-access form: requests are captured in this browser until the
                    Phase 4 backend wires this to your real account. nothing is sent or charged.
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="relative mt-8 space-y-3">
                <div className="grid md:grid-cols-2 gap-3">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@yourstartup.com"
                    className="w-full rounded-xl border border-line bg-paper px-4 py-3 text-[14px] text-ink placeholder:text-inksoft/60 outline-none focus:border-accent transition-colors"
                  />
                  <select
                    value={job}
                    onChange={(e) => setJob(e.target.value)}
                    className="w-full rounded-xl border border-line bg-paper px-4 py-3 text-[14px] text-ink outline-none focus:border-accent transition-colors"
                  >
                    {jobOptions.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-2 text-[14.5px] font-display font-medium bg-ink text-white px-6 py-3.5 rounded-xl hover:bg-accent transition-colors"
                >
                  Create my bot — free <ArrowRight className="w-4 h-4" />
                </button>
                <p className="font-mono text-[10.5px] text-inksoft text-center">
                  no waitlist copy, no charge · gatekeeper approval opens with computer rollout
                </p>
              </form>
            )}
          </div>
        </Section>
      </div>
    </section>
  );
}
