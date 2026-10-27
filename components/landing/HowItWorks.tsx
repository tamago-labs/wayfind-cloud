'use client';

import Section from './Section';

const steps = [
  {
    num: '01',
    title: 'Create a Bot',
    mono: 'bots.new',
    body: 'Tap New Bot, pick a Finder face, give it a name. Thirty seconds — no workflow builder, no config screens.',
    panel: 'name = Amber\nface = Amber · Warm Amber\n[ create ]',
  },
  {
    num: '02',
    title: 'Give it a job',
    mono: 'first message',
    body: 'Your first message is the job description: the outcome, the sources that matter, the boundaries, and where it must stop for you. Ask it to remember — it will.',
    panel: '"Your job is my inbox. Draft replies in my voice. Never send without approval. Remember this."',
  },
  {
    num: '03',
    title: 'Connect apps as it asks',
    mono: 'connect.apps',
    body: 'When a task needs Gmail, Slack or GitHub, the Bot asks in chat. You connect once — the app is then available to every Bot you own, and the Bot never sees your tokens.',
    panel: 'amber wants: gmail (read, draft)\n[ connect ] — account-wide',
  },
  {
    num: '04',
    title: 'Chat. Approve. Routinise.',
    mono: 'skills + routines',
    body: 'Work happens in the conversation: drafts, files, approval cards. When a task works reliably, save it as a skill and put it on a routine — nightly, weekly, or on an event.',
    panel: 'save skill: "nightly inbox triage"\nroutine: weekdays 07:00 → this chat',
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className="py-20 md:py-24 scroll-mt-16 grid-bg">
      <div className="max-w-[1200px] mx-auto px-5 md:px-8">
        <Section>
          <p className="font-mono text-[12px] text-accent text-center mb-4">how it works</p>
          <h2 className="font-display text-3xl md:text-[40px] font-bold text-center tracking-tight text-ink">
            Setup is a message, not a workflow builder
          </h2>
          <p className="text-center text-inksoft text-[15px] max-w-lg mx-auto mt-4">
            Create a Bot, describe the job, grant access as it asks. The same Bot keeps
            its memory, files and routines across every conversation.
          </p>
        </Section>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 mt-12">
          {steps.map((s) => (
            <Section key={s.num}>
              <div className="bg-cream rounded-3xl border border-line p-6 shadow-card h-full">
                <p className="font-mono text-[13px] text-accent">{s.num}</p>
                <h3 className="font-display text-lg font-semibold text-ink mt-2">{s.title}</h3>
                <p className="text-[13px] text-inksoft leading-relaxed mt-2">{s.body}</p>
                <div className="mt-4 rounded-xl bg-dark text-white p-4">
                  <p className="font-mono text-[10.5px] text-white/40 mb-2">{s.mono}</p>
                  <p className="font-mono text-[11.5px] text-white/80 leading-relaxed whitespace-pre-line">{s.panel}</p>
                </div>
              </div>
            </Section>
          ))}
        </div>

        <Section>
          <p className="text-center font-mono text-[11.5px] text-inksoft mt-10 max-w-2xl mx-auto leading-relaxed">
            the path that earns trust: one real task → correct it → save the skill → test it → routine.
            automate preparation before execution, and keep sending, paying, deleting behind approval.
          </p>
        </Section>
      </div>
    </section>
  );
}
