import { PageHead, EmptyState, PhaseNote } from '@/components/app/ui';
import { finders } from '@/components/landing/finders';

export default function SkillsPage() {
  return (
    <>
      <PageHead
        mono="skills"
        title="Skills"
        sub="A skill is a saved way of doing a task well: when to use it, the inputs and access it needs, the steps, how to validate the result, what to return, and what still needs your approval. Skills are shared across your Bots."
      />

      <div className="space-y-3 mb-6">
        {finders.map((f) => (
          <article key={f.id} className="rounded-3xl border border-line bg-cream p-5 shadow-card flex items-start gap-4">
            <img src={f.img} alt={f.name} className="w-11 h-11 rounded-full object-cover shrink-0" />
            <div className="min-w-0">
              <p className="text-[14px] font-display font-medium text-ink">
                {f.skill.name} <span className="font-mono text-[10.5px] text-inksoft ml-1">starter · with {f.name}</span>
              </p>
              <p className="text-[12.5px] text-inksoft leading-relaxed mt-1">{f.skill.desc}</p>
            </div>
          </article>
        ))}
      </div>

      <EmptyState
        mono="skills.yours — empty"
        title="Your first skill comes from real work"
        body="Do a task with a Bot once, correct it until the result is reviewable, then say: save the process we used as a skill. You can also teach a workflow by showing it once. No skills of yours exist yet."
      />

      <PhaseNote>
        starter skills above ship with the templates. saving, editing and per-Bot enabling
        arrive with chat + skills phases.
      </PhaseNote>
    </>
  );
}
