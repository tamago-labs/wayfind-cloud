import { PageHead, PhaseNote, StatusChip } from '@/components/app/ui';

const apps = [
  { name: 'Slack', group: 'talk & approve', note: 'Briefs, questions and approval cards can also reach you in Slack. First connector to ship.', when: '1st' },
  { name: 'Gmail', group: 'work', note: 'Read, search and draft. Sends always wait for your approval in chat.', when: '2nd' },
  { name: 'Google Calendar', group: 'work', note: 'Schedule awareness for briefs, digests and follow-ups.', when: '2nd' },
  { name: 'GitHub', group: 'build', note: 'Issues, repos and draft PRs — also how the computer proves itself.', when: '3rd' },
  { name: 'Web / RSS / Search', group: 'watch', note: 'No login needed. Watchers check quietly and wake a Bot only on real change.', when: '4th' },
  { name: 'Google Sheets', group: 'work', note: 'Where lead lists and trackers land, scored and sourced.', when: '5th' },
  { name: 'Notion', group: 'work', note: 'Research and briefs filed where your team already reads.', when: '5th' },
  { name: 'Telegram', group: 'talk & approve', note: 'A second chat surface for you — approvals from your phone.', when: '6th' },
];

export default function AppsPage() {
  return (
    <>
      <PageHead
        mono="connect.apps"
        title="Connect apps"
        sub="Connect an app once and every Bot you own can use it. Your login stays with Wayfind's connector backend — a Bot invokes tools without ever receiving your tokens, and anything it writes still stops at your approval."
      />

      <div className="grid sm:grid-cols-2 gap-4">
        {apps.map((a) => (
          <article key={a.name} className="rounded-3xl border border-line bg-cream p-5 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-[15px] font-semibold text-ink">{a.name}</h2>
              <StatusChip label={`roadmap · ${a.when}`} tone="idle" />
            </div>
            <p className="font-mono text-[10.5px] text-inksoft mt-1">{a.group}</p>
            <p className="text-[13px] text-inksoft leading-relaxed mt-2.5">{a.note}</p>
            <button
              disabled
              className="mt-4 font-mono text-[11px] px-4 py-2 rounded-lg border border-line bg-paper text-inksoft opacity-50 cursor-not-allowed"
            >
              connect — with your account
            </button>
          </article>
        ))}
      </div>

      <PhaseNote>
        nothing is connected and nothing can be — accounts and the connector framework land in
        the backend/connect phases. per-Bot enable switches appear on each Bot's details page.
      </PhaseNote>
    </>
  );
}
