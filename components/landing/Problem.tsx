import Mascot, { type MascotColor } from '@/components/Mascot';

const cards: { color: MascotColor; title: string; body: string }[] = [
  {
    color: 'amber',
    title: 'Bundled into big plans',
    body: 'The best background agents come inside subscriptions that run from $20 to $300 a month, even if you only need one assistant.',
  },
  {
    color: 'lagoon',
    title: 'Launched in a few regions',
    body: 'Many start in the US. If you\u2019re an indie operator in Southeast Asia, you wait, or work around it.',
  },
  {
    color: 'moss',
    title: 'Paying for idle time',
    body: 'A computer that\u2019s on all day costs money all day, even while your Bot is waiting for you to reply.',
  },
];

export default function Problem() {
  return (
    <section id="problem" className="scroll-mt-16 bg-ice px-6 py-24 font-brico text-navy">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-bold uppercase tracking-wider text-cta">The problem</p>
        <h2 className="mt-3 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          Always-on agents shouldn&rsquo;t need an enterprise budget.
        </h2>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {cards.map((c) => (
            <div key={c.title} className="rounded-3xl bg-white p-7 shadow-sm">
              <Mascot color={c.color} size="md" motion="none" />
              <h3 className="mt-5 text-xl font-bold">{c.title}</h3>
              <p className="mt-2 text-heroslate">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
