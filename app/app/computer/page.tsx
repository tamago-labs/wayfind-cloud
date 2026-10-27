import { Monitor, FolderGit2, Globe, TerminalSquare, MoonStar } from 'lucide-react';
import { PageHead, PhaseNote, StatusChip } from '@/components/app/ui';
import RequestComputer from '@/components/app/RequestComputer';

const surfaces = [
  { icon: Globe, title: 'Browser', body: 'Signed-in sessions persist between tasks and are shared by your Bots — that is how handoffs skip re-login.' },
  { icon: FolderGit2, title: 'Files & workspace', body: 'Durable project files live in a clear workspace. Results can be attached straight into chat as artifacts.' },
  { icon: TerminalSquare, title: 'Terminal', body: 'Real command line for builds, scripts and data work — inside your isolated computer, never on your machine.' },
  { icon: MoonStar, title: 'Sleep & wake', body: 'Suspends when idle (no charges), resumes in seconds on a message, a routine, or an event. Work checkpoints before it sleeps.' },
];

export default function ComputerPage() {
  return (
    <>
      <PageHead
        mono="computer"
        title="Your computer"
        sub="One persistent cloud computer per account, shared by every Bot you own. Strictly isolated from every other account. This is where browsers, files and terminal work live — chat is just how you direct it."
      />

      <div className="rounded-3xl bg-dark text-white shadow-card overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between flex-wrap gap-2">
          <span className="font-mono text-[11px] text-white/50 flex items-center gap-2">
            <Monitor className="w-4 h-4" /> computer.status
          </span>
          <StatusChip label="not provisioned" tone="off" />
        </div>
        <div className="px-6 py-6">
          <p className="font-mono text-[12px] leading-relaxed text-white/70 max-w-xl">
            no computer exists for this account yet. when you request one, the gatekeeper checks:
            verified account · one computer per account · region capacity · abuse limits — then
            provisions it on aws lambda microvms and shows the decision and reason here.
          </p>
          <RequestComputer />
        </div>
        <p className="px-6 py-3 font-mono text-[10.5px] text-white/35 border-t border-white/10">
          watch / take-over, suspend & resume, storage and reset controls appear here once it exists.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {surfaces.map((s) => (
          <article key={s.title} className="rounded-3xl border border-line bg-cream p-5 shadow-card">
            <s.icon className="w-5 h-5 text-accent mb-3" />
            <h2 className="text-[14.5px] font-display font-semibold text-ink mb-1.5">{s.title}</h2>
            <p className="text-[13px] text-inksoft leading-relaxed">{s.body}</p>
          </article>
        ))}
      </div>

      <PhaseNote>
        one warning, by design: anything placed on this computer is available to every Bot of
        this account. don't store a credential there that another of your Bots shouldn't use.
        provisioning arrives with the computer phase (lambda microvms).
      </PhaseNote>
    </>
  );
}
