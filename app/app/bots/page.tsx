import Link from 'next/link';
import { PageHead, PhaseNote, FinderAvatar, StatusChip } from '@/components/app/ui';
import { finders } from '@/components/landing/finders';

export default function BotsPage() {
  return (
    <>
      <PageHead
        mono="bots.roster"
        title="Your Bots"
        sub="The roster is the product: named Bots with faces, jobs and memory. These four are starter templates — creating, renaming, pinning and sectioning them activates with your account."
      />

      <div className="space-y-3">
        {finders.map((f) => (
          <article
            key={f.id}
            className="rounded-3xl border border-line bg-cream p-5 shadow-card flex flex-col sm:flex-row sm:items-center gap-4"
          >
            <FinderAvatar finder={f} size="w-14 h-14" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display text-[15px] font-semibold text-ink">{f.name}</h2>
                <span className="font-mono text-[11px] text-inksoft">{f.job}</span>
                <StatusChip label="template" tone="idle" />
              </div>
              <p className="text-[13px] text-inksoft leading-relaxed mt-1.5">{f.does}</p>
              <p className="font-mono text-[10.5px] text-inksoft mt-2">
                skill: {f.skill.name} · routine: {f.routine.name} ({f.routine.when})
              </p>
            </div>
            <div className="flex sm:flex-col gap-2 shrink-0">
              <Link
                href={`/app?bot=${f.id}`}
                className="text-center text-[12.5px] font-display font-medium bg-ink text-white px-4 py-2 rounded-lg hover:bg-accent transition-colors"
              >
                Open chat
              </Link>
              <Link
                href={`/app/bots/${f.id}`}
                className="text-center font-mono text-[11px] px-4 py-2 rounded-lg border border-line bg-paper text-ink hover:border-ink/30 transition-colors"
              >
                details
              </Link>
            </div>
          </article>
        ))}
      </div>

      <div className="rounded-3xl border border-dashed border-ink/20 bg-cream p-6 mt-5 text-center">
        <p className="font-mono text-[11px] text-inksoft">+ new bot</p>
        <p className="text-[13.5px] text-inksoft leading-relaxed max-w-md mx-auto mt-2">
          Any name, any job — or start blank and give it a job in its first message.
          Creation activates with accounts in the backend phase.
        </p>
      </div>

      <PhaseNote>
        organiser tools arrive with your account: pin to top, sections by project or client,
        hide without deleting, duplicate for a new scope, share a Bot as a template link.
      </PhaseNote>
    </>
  );
}
