import { PageHead, EmptyState, PhaseNote, StatusChip } from '@/components/app/ui';
import { finders } from '@/components/landing/finders';

export default function RoutinesPage() {
  return (
    <>
      <PageHead
        mono="routines"
        title="Routines"
        sub="A routine tells one Bot when to run: on a schedule, or after an event like a Slack message, a GitHub notification or a webhook. Results post back into that Bot's chat. Routines run while your laptop is closed."
      />

      <div className="space-y-3 mb-6">
        {finders.map((f) => (
          <article key={f.id} className="rounded-3xl border border-line bg-cream p-5 shadow-card flex items-center gap-4">
            <img src={f.img} alt={f.name} className="w-11 h-11 rounded-full object-cover shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-display font-medium text-ink">{f.routine.name}</p>
              <p className="font-mono text-[10.5px] text-inksoft mt-0.5">
                {f.name} · {f.routine.when} · skill: {f.skill.name}
              </p>
            </div>
            <StatusChip label="not scheduled" tone="sleeping" />
          </article>
        ))}
      </div>

      <EmptyState
        mono="routines.yours — empty"
        title="Nothing is on a schedule yet"
        body="Create a routine by asking a Bot in chat once a task works reliably: every weekday at 08:00, run this, post it here, don't contact anyone. Test it first — a test run does real work on safe inputs."
      />

      <div className="rounded-3xl bg-dark text-white p-6 shadow-card mt-6">
        <p className="font-mono text-[11px] text-white/50 mb-3">routine anatomy — every routine states</p>
        <p className="font-mono text-[11.5px] leading-[1.9] text-white/75">
          owner Bot · when (schedule, timezone, or event rule) · input source ·
          expected result in chat · approval boundary · what happens when a source is missing
          (report it — never silently use old data)
        </p>
      </div>

      <PhaseNote>
        template routines above are not scheduled and have never run. scheduling, event triggers,
        run history and pause/resume arrive with the skills & routines phase.
      </PhaseNote>
    </>
  );
}
