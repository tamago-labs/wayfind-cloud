'use client';

import Section from './Section';

const groups = [
  { label: 'talk & approve', items: ['Slack', 'Telegram', 'Email'] },
  { label: 'work', items: ['Gmail', 'Google Calendar', 'Google Sheets', 'Notion', 'Google Drive'] },
  { label: 'build', items: ['GitHub'] },
  { label: 'watch', items: ['Web', 'RSS', 'Search'] },
];

export default function CompatibleWith() {
  return (
    <section id="connectors" className="py-16 border-y border-line bg-cream/60">
      <div className="max-w-[1200px] mx-auto px-5 md:px-8">
        <Section>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
            <div>
              <p className="font-mono text-[12px] text-accent mb-3">connectors</p>
              <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-ink">Works where you already work</h2>
            </div>
            <p className="font-mono text-[11.5px] text-inksoft max-w-sm leading-relaxed">
              connect once, account-wide: every Bot you own can use the app, and the
              Bot never receives your tokens. roadmap, in build order.
            </p>
          </div>
        </Section>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {groups.map((g) => (
            <Section key={g.label}>
              <div className="rounded-2xl border border-line bg-paper p-4 h-full">
                <p className="font-mono text-[11px] text-inksoft mb-3">{g.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.items.map((item) => (
                    <span key={item} className="font-mono text-[11.5px] px-2.5 py-1.5 rounded-lg bg-cream border border-line text-ink">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </Section>
          ))}
        </div>

        <Section>
          <p className="font-mono text-[11px] text-inksoft mt-5">
            build order: 1 slack (briefs + approvals) → 2 gmail + calendar → 3 github → 4 web/rss → 5 sheets + notion → 6 telegram · later: drive, linear, webhooks
          </p>
        </Section>
      </div>
    </section>
  );
}
