import Link from 'next/link';
import Mascot from '@/components/Mascot';

const brands = [
  { n: 'Zoho CRM', img: '/connectors/zohocrm.svg' },
  { n: 'Stripe', img: '/connectors/stripe.png' },
  { n: 'HubSpot', img: '/connectors/hubspot.png' },
  { n: 'Outlook', img: '/connectors/outlook.png' },
  { n: 'Mailchimp', img: '/connectors/mailchimp.png' },
  { n: 'Calendly', img: '/connectors/calendly.png' },
  { n: 'Notion', img: '/connectors/notion.png' },
  { n: 'FreshBooks', img: '/connectors/freshbooks.png' },
];

const bots = [
  { n: 'Chief of Staff', color: 'amber' as const, shape: 'blob' as const, status: 'reviewing Friday update…' },
  { n: 'Finance', color: 'moss' as const, shape: 'squircle' as const, status: 'in Stripe · 3 invoices' },
  { n: 'Operations', color: 'lagoon' as const, shape: 'circle' as const, status: 'in Mail · triaging inbox' },
  { n: 'Marketing', color: 'amber' as const, shape: 'pebble' as const, status: 'in Social · scheduling posts' },
];

export default function Connectors() {
  return (
    <section id="connectors" className="scroll-mt-16 bg-white px-6 py-24 font-brico text-navy">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-bold uppercase tracking-wider text-cta">Connectors</p>
        <h2 className="mt-3 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          Your Bots work in the apps you already use.
        </h2>
        <p className="mt-5 max-w-2xl text-lg text-heroslate">
          Connect your business tools once and let your whole AI team use them. Your
          Bots can work across the services your business already relies on.
        </p>

        <div className="mt-12 grid items-stretch gap-4 lg:grid-cols-[2fr_1fr_2fr]">
          <div className="rounded-3xl border border-navy/10 p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-heroslate">
              Supported apps
            </p>
            <div className="mt-4 grid grid-cols-4 gap-4 text-center">
              {brands.map((b) => (
                <div key={b.n}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={b.img}
                    alt={`${b.n} logo`}
                    className="mx-auto h-14 w-14 rounded-full border border-navy/10 bg-white object-contain p-2 shadow-sm"
                    loading="lazy"
                  />
                  <p className="mt-1.5 text-xs font-bold">{b.n}</p>
                </div>
              ))}
            </div>
            <Link
              href="/connectors"
              className="mt-5 block border-t border-navy/10 pt-4 text-sm font-bold text-cta hover:underline"
            >
              Browse connectors &rarr;
            </Link>
          </div>

          <div className="rounded-3xl border border-navy/10 p-6 text-center">
            <div className="flex h-full flex-col justify-center divide-y divide-navy/10">
              <div className="pb-4">
                <p className="text-3xl font-extrabold text-cta">100+</p>
                <p className="mt-1 text-xs font-bold text-heroslate">services</p>
              </div>
              <div className="py-4">
                <p className="text-3xl font-extrabold text-cta">1</p>
                <p className="mt-1 text-xs font-bold text-heroslate">shared workspace</p>
              </div>
              <div className="pt-4">
                <p className="text-3xl font-extrabold text-cta">24/7</p>
                <p className="mt-1 text-xs font-bold text-heroslate">always on</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-navy/10 p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-cta">
              Your AI team at work
            </p>
            <ul className="mt-4 space-y-3.5">
              {bots.map((b, i) => (
                <li key={b.n} className="flex items-center gap-3">
                  <span className="relative shrink-0">
                    <Mascot
                      color={b.color}
                      shape={b.shape}
                      size="sm"
                      motion="none"
                      blinkDelay={`-${i * 1.4}s`}
                    />
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" />
                  </span>
                  <span className="text-sm font-bold">
                    {b.n}
                    <span className="block text-xs font-normal text-heroslate">{b.status}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-navy/10 pt-3 text-xs text-heroslate">
              + HR · Intern · Other Bots
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
