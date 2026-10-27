import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FinderAvatar, PhaseNote, StatusChip } from '@/components/app/ui';
import { finders } from '@/components/landing/finders';

export function generateStaticParams() {
  return finders.map((f) => ({ id: f.id }));
}

export default function BotDetailPage({ params }: { params: { id: string } }) {
  const finder = finders.find((f) => f.id === params.id);
  if (!finder) notFound();

  return (
    <>
      <div className="flex items-start gap-4 mb-8">
        <FinderAvatar finder={finder} size="w-16 h-16" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{finder.name}</h1>
            <StatusChip label="template — not created yet" tone="idle" />
          </div>
          <p className="font-mono text-[11px] text-inksoft mt-1">
            {finder.trait} · {finder.job}
          </p>
          <p className="text-[13.5px] text-inksoft leading-relaxed mt-2 max-w-xl">{finder.does}</p>
        </div>
        <Link
          href={`/app?bot=${finder.id}`}
          className="text-[12.5px] font-display font-medium bg-ink text-white px-4 py-2 rounded-lg hover:bg-accent transition-colors shrink-0"
        >
          Open chat
        </Link>
      </div>

      <div className="space-y-5">
        <section className="rounded-3xl border border-line bg-cream p-6 shadow-card">
          <p className="font-mono text-[11px] text-accent mb-3">about — the durable brief</p>
          <p className="text-[13.5px] text-ink leading-relaxed">“{finder.starter}”</p>
          <p className="font-mono text-[10.5px] text-inksoft mt-3 leading-relaxed">
            this is the job description the Bot remembers. you edit it by messaging the Bot
            (“lasting rule: from now on…”) or here, once the Bot is yours.
          </p>
        </section>

        <section className="rounded-3xl border border-line bg-cream p-6 shadow-card">
          <p className="font-mono text-[11px] text-accent mb-3">memory</p>
          <p className="text-[13.5px] text-inksoft leading-relaxed">
            Empty. {finder.name}&apos;s memory — preferences, facts, summaries of finished work —
            starts with your first real conversation and compounds from there. Shared files
            and logins live on your computer, not in memory.
          </p>
        </section>

        <div className="grid md:grid-cols-2 gap-5">
          <section className="rounded-3xl border border-line bg-cream p-6 shadow-card">
            <p className="font-mono text-[11px] text-accent mb-3">skills</p>
            <p className="text-[14px] font-display font-medium text-ink">{finder.skill.name}</p>
            <p className="text-[12.5px] text-inksoft leading-relaxed mt-1">{finder.skill.desc}</p>
            <p className="font-mono text-[10.5px] text-inksoft mt-3">
              starter skill · yours to edit after the first real run
            </p>
          </section>

          <section className="rounded-3xl border border-line bg-cream p-6 shadow-card">
            <p className="font-mono text-[11px] text-accent mb-3">routines</p>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[14px] font-display font-medium text-ink">{finder.routine.name}</p>
                <p className="font-mono text-[11px] text-inksoft mt-0.5">{finder.routine.when} · posts into chat</p>
              </div>
              <StatusChip label="not scheduled" tone="sleeping" />
            </div>
            <p className="font-mono text-[10.5px] text-inksoft mt-3">
              run history will list every run, its output and its cost — nothing runs yet.
            </p>
          </section>
        </div>

        <section className="rounded-3xl bg-dark text-white p-6 shadow-card">
          <p className="font-mono text-[11px] text-white/50 mb-3">connect apps for this Bot</p>
          <div className="flex flex-wrap gap-2">
            {finder.connectors.map((c) => (
              <span key={c} className="font-mono text-[11px] px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-white/80">
                {c} — not connected
              </span>
            ))}
          </div>
          <p className="font-mono text-[10.5px] text-white/35 mt-4 leading-relaxed">
            apps connect once, account-wide, from connect apps. the Bot uses them without ever receiving your tokens.
          </p>
        </section>
      </div>

      <PhaseNote>
        template preview · creating this Bot, live memory, skills and routines arrive with
        accounts + chat (backend and model phases).
      </PhaseNote>
    </>
  );
}
