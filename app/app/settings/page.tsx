import { PageHead, PhaseNote, StatusChip } from '@/components/app/ui';

const rows = [
  { mono: 'account', label: 'Account', value: 'Not signed in', chip: <StatusChip label="Phase 4" tone="off" />, note: 'Email sign-in (Cognito) is wired with the backend. Until then there is no account — and nothing collects your data here.' },
  { mono: 'plan', label: 'Plan', value: 'Free — early access', chip: <StatusChip label="not on sale" tone="idle" />, note: 'Planned: Starter $5 (1 Bot) · Operator $10 (up to 5 Bots, group chats) · Studio $20 (up to 15 Bots). Existing free users are notified before any billing ever starts.' },
  { mono: 'computer', label: 'Computer', value: 'Not provisioned', chip: <StatusChip label="gate closed" tone="off" />, note: 'One computer per account, shared by your Bots, created only after the gatekeeper check. Region decided at rollout; it suspends when idle.' },
  { mono: 'usage', label: 'Usage', value: '0 minutes · 0 credits', chip: <StatusChip label="metered later" tone="idle" />, note: 'You pay for active Bot work and active computer minutes, never idle time. Every run shows its cost in chat and in routine history.' },
  { mono: 'connect apps', label: 'Connect apps', value: 'None connected', chip: <StatusChip label="roadmap" tone="idle" />, note: 'Account-wide, from the connect apps page. Build order: Slack → Gmail + Calendar → GitHub → Web/RSS → Sheets + Notion → Telegram.' },
];

export default function SettingsPage() {
  return (
    <>
      <PageHead
        mono="settings"
        title="Settings"
        sub="Account, plan, computer and usage. Everything here is read-only until your real account exists — these are the values the backend will fill in."
      />

      <div className="rounded-3xl border border-line bg-cream shadow-card overflow-hidden">
        <div className="divide-y divide-line">
          {rows.map((r) => (
            <div key={r.mono} className="px-6 py-5 flex flex-col md:flex-row md:items-start gap-3 md:gap-6">
              <div className="md:w-48 shrink-0">
                <p className="font-mono text-[10.5px] text-inksoft">{r.mono}</p>
                <p className="text-[14px] font-display font-medium text-ink mt-1">{r.label}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] text-ink">{r.value}</p>
                <p className="text-[12.5px] text-inksoft leading-relaxed mt-1">{r.note}</p>
              </div>
              <div className="shrink-0">{r.chip}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-warn2/30 bg-warn2/[0.04] p-6 mt-6">
        <p className="font-mono text-[11px] text-[#a33]">danger zone — arrives with your account</p>
        <p className="text-[13px] text-inksoft leading-relaxed mt-2">
          Pause all Bots and routines, revoke every connected app, reset or delete your computer + data.
          One click each, always available, no support ticket. Controls activate when there is something
          to control. Deleting a Bot removes its profile, chats and routines — shared computer files are
          cleaned up separately.
        </p>
      </div>

      <PhaseNote>
        phase 3 app shell · live settings arrive with auth + gatekeeper in Phase 4.
      </PhaseNote>
    </>
  );
}
