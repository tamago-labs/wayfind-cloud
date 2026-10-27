import { Check, KeyRound, ShieldCheck, ScrollText } from 'lucide-react';

const rows = [
  {
    icon: Check,
    title: 'Approval before anything irreversible',
    body: 'Sending, paying or deleting shows up as a request right in the chat. You say yes or no.',
  },
  {
    icon: KeyRound,
    title: 'Secrets never go in chat',
    body: 'Credentials go through secure forms. Connected-app tokens stay on the connector backend, so a Bot never sees them.',
  },
  {
    icon: ShieldCheck,
    title: 'VM-level isolation',
    body: 'Your computer runs in its own MicroVM. Accounts are strictly separated from each other.',
  },
  {
    icon: ScrollText,
    title: 'An audit trail for every action',
    body: 'See what each Bot did, when, and which approval it came from.',
  },
];

export default function Trust() {
  return (
    <section id="trust" className="scroll-mt-16 bg-white px-6 py-24 font-brico text-navy">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-bold uppercase tracking-wider text-cta">Trust</p>
        <h2 className="mt-3 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          Always-on, but never out of your control.
        </h2>
        <div className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2">
          {rows.map((r) => (
            <div key={r.title} className="flex gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ice text-navy">
                <r.icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-lg font-bold">{r.title}</h3>
                <p className="mt-1 text-heroslate">{r.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
