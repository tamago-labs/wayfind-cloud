import { Check, KeyRound, ShieldCheck, ScrollText } from 'lucide-react';

const groups = [
  { label: 'Talk & approve', items: ['Slack', 'Telegram', 'Email'] },
  { label: 'Work', items: ['Gmail', 'Google Calendar', 'Google Sheets', 'Notion', 'Google Drive'] },
  { label: 'Build', items: ['GitHub'] },
  { label: 'Watch', items: ['Web', 'RSS', 'Search'] },
];

const trust = [
  { icon: Check, text: 'Approval before anything irreversible — right in the chat' },
  { icon: KeyRound, text: 'Secrets via secure forms; app tokens stay on our backend, never with the Bot' },
  { icon: ShieldCheck, text: 'VM-level isolation between accounts' },
  { icon: ScrollText, text: 'An audit trail for every action' },
];

export default function Trust() {
  return (
    <section id="connectors" className="scroll-mt-16 bg-white px-6 py-24 font-brico text-navy">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-bold uppercase tracking-wider text-cta">Connectors</p>
        <h2 className="mt-3 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          Your Bots work in the apps you already use.
        </h2>
        <p className="mt-5 max-w-3xl text-lg text-heroslate">
          Connect an app once and every Bot on your account can use it. These are the connectors on our
          roadmap, in build order — the first one we ship is decided by the first Bots our early users create.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map((g) => (
            <div key={g.label} className="rounded-2xl border border-navy/10 bg-ice p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-heroslate">{g.label}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {g.items.map((item) => (
                  <span key={item} className="rounded-lg border border-navy/10 bg-white px-2.5 py-1.5 text-sm font-semibold">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-heroslate">
          Build order: Slack → Gmail + Calendar → GitHub → Web/RSS → Sheets + Notion → Telegram. Least-access scopes, always.
        </p>

        <div className="mt-12 grid gap-3 border-t border-navy/10 pt-8 sm:grid-cols-2 lg:grid-cols-4">
          {trust.map((t) => (
            <div key={t.text} className="flex items-start gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ice text-navy">
                <t.icon className="h-4 w-4" />
              </span>
              <p className="text-sm font-semibold leading-snug">{t.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
