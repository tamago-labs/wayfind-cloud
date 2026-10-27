const steps = [
  {
    num: '1',
    title: 'You send a message',
    body: '\u201cReconcile this week\u2019s receipts.\u201d Your computer is asleep, costing nothing.',
    highlight: false,
  },
  {
    num: '2',
    title: 'The MicroVM resumes',
    body: 'Near-instant launch and resume, with files, logins and browser sessions exactly where you left them.',
    highlight: true,
  },
  {
    num: '3',
    title: 'Your Bots work',
    body: 'Each Bot gets its own screen on the shared computer, so several can work in parallel.',
    highlight: false,
  },
  {
    num: '4',
    title: 'It suspends when idle',
    body: 'State is preserved and billing stops. That\u2019s how a $5 plan works.',
    highlight: false,
  },
];

const chips = [
  'VM-level isolation',
  'Firecracker microVMs',
  'State preservation',
  'One computer per account',
  'Runs with your laptop closed',
];

export default function HowSection() {
  return (
    <section id="how" className="scroll-mt-16 bg-navy px-6 py-24 font-brico text-white">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-bold uppercase tracking-wider text-bamber">How we make it $5</p>
        <h2 className="mt-3 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          A real computer that sleeps when you do.
        </h2>
        <p className="mt-5 max-w-2xl text-lg text-white/70">
          Every account gets its own cloud computer, built on AWS Lambda MicroVMs, a serverless
          compute primitive powered by Firecracker. It wakes almost instantly when a message arrives
          and goes quiet when the work is done.
        </p>
        <ol className="mt-12 grid gap-4 md:grid-cols-4">
          {steps.map((s) => (
            <li key={s.num} className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <span
                className={`grid h-9 w-9 place-items-center rounded-full font-bold ${
                  s.highlight ? 'animate-awake bg-blagoon text-navy' : 'bg-white/10'
                }`}
              >
                {s.num}
              </span>
              <h3 className="mt-4 font-bold">{s.title}</h3>
              <p className="mt-2 text-sm text-white/65">{s.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex flex-wrap gap-3 text-sm font-semibold">
          {chips.map((chip) => (
            <span key={chip} className="rounded-full border border-white/20 px-4 py-2">
              {chip}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
