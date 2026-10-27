import Mascot, { type MascotColor } from '@/components/Mascot';

const bots: { color: MascotColor; name: string; role: string; quote: string }[] = [
  {
    color: 'amber',
    name: 'Amber',
    role: 'Chief of staff',
    quote: '\u201cTriage my inbox. Never send without asking me.\u201d',
  },
  {
    color: 'moss',
    name: 'Moss',
    role: 'Expense manager',
    quote: '\u201cMatch receipts to the card statement every Friday.\u201d',
  },
  {
    color: 'lagoon',
    name: 'Lagoon',
    role: 'Talent scout',
    quote: '\u201cFind 10 senior designers and draft intros for review.\u201d',
  },
  {
    color: 'ash',
    name: 'Ash',
    role: 'Bug reproduction',
    quote: '\u201cReproduce bug 212 and attach the steps.\u201d',
  },
];

export default function Bots() {
  return (
    <section id="bots" className="scroll-mt-16 bg-ice px-6 py-24 font-brico text-navy">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-bold uppercase tracking-wider text-cta">Meet the Bots</p>
        <h2 className="mt-3 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          One job each. Any model you choose.
        </h2>
        <p className="mt-5 max-w-2xl text-lg text-heroslate">
          Name a Bot, give it its job in the first message, and pick the AI model that suits the
          work. Memory compounds, so it gets better the longer it works for you.
        </p>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {bots.map((b) => (
            <div key={b.name} className="rounded-3xl bg-white p-6 shadow-sm transition hover:-translate-y-1">
              <Mascot color={b.color} size="lg" motion="none" />
              <h3 className="mt-5 text-xl font-bold">{b.name}</h3>
              <p className="text-sm font-semibold text-cta">{b.role}</p>
              <p className="mt-3 text-sm text-heroslate">{b.quote}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-sm text-heroslate">
          Tell a Bot “Lasting rule: from now on…” and it remembers. Save a finished task as a
          skill, then run it on a schedule as a routine.
        </p>
      </div>
    </section>
  );
}
