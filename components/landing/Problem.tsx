import Mascot, { type MascotColor, type MascotShape } from '@/components/Mascot';

const cards: { color: MascotColor; shape: MascotShape; title: string; body: string }[] = [
  {
    color: 'amber',
    shape: 'squircle',
    title: 'Bundled into big plans',
    body: 'Grok Bot, OpenAI Dots and Claude Duet come with subscriptions costing $20–$300 a month.',
  },
  {
    color: 'lagoon',
    shape: 'circle',
    title: 'Not available everywhere',
    body: 'Many AI agents launch in limited regions. Outside those markets, access can be a barrier before you start.',
  },
  {
    color: 'moss',
    shape: 'pebble',
    title: 'Locked into one vendor',
    body: 'Your workflow should not depend on one vendor. Choose the AI that fits each task, and switch anytime.',
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
          {cards.map((c, i) => (
            <div key={c.title} className="rounded-3xl bg-white p-7 shadow-sm">
              <Mascot color={c.color} shape={c.shape} size="md" motion="none" blinkDelay={`-${i * 1.4}s`} />
              <h3 className="mt-5 text-xl font-bold">{c.title}</h3>
              <p className="mt-2 text-heroslate">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
