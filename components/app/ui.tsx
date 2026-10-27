import Link from 'next/link';
import type { Finder } from '@/components/landing/finders';

export function PageHead({ mono, title, sub }: { mono: string; title: string; sub: string }) {
  return (
    <div className="mb-8">
      <p className="font-mono text-[11.5px] text-accent mb-2">{mono}</p>
      <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-ink">{title}</h1>
      <p className="text-[14px] text-inksoft leading-relaxed mt-2 max-w-xl">{sub}</p>
    </div>
  );
}

export function EmptyState({
  mono,
  title,
  body,
  cta,
}: {
  mono: string;
  title: string;
  body: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="rounded-3xl border border-dashed border-ink/20 bg-cream p-8 md:p-10 text-center">
      <p className="font-mono text-[11px] text-inksoft">{mono}</p>
      <h2 className="font-display text-lg font-semibold text-ink mt-3">{title}</h2>
      <p className="text-[13.5px] text-inksoft leading-relaxed max-w-md mx-auto mt-2">{body}</p>
      {cta && (
        <Link
          href={cta.href}
          className="inline-block mt-5 text-[13px] font-display font-medium bg-ink text-white px-5 py-2.5 rounded-lg hover:bg-accent transition-colors"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}

export function StatusChip({ label, tone }: { label: string; tone: 'idle' | 'working' | 'waiting' | 'sleeping' | 'off' }) {
  const tones: Record<string, string> = {
    idle: 'bg-ink/5 text-inksoft',
    working: 'bg-fmoss/20 text-[#2f6b1c]',
    waiting: 'bg-famber/20 text-[#8a5a00]',
    sleeping: 'bg-fash/25 text-[#4b5563]',
    off: 'bg-warn2/15 text-[#a33]',
  };
  return <span className={`font-mono text-[10.5px] px-2.5 py-1 rounded-full ${tones[tone]}`}>{label}</span>;
}

export function FinderAvatar({ finder, size = 'w-11 h-11' }: { finder: Finder; size?: string }) {
  return (
    <img
      src={finder.img}
      alt={`${finder.name} — ${finder.job}`}
      className={`${size} rounded-full object-cover ring-2 ${finder.ring} shrink-0`}
    />
  );
}

export function PhaseNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] leading-relaxed text-inksoft border border-line bg-cream/70 rounded-xl px-4 py-3 mt-6">
      {children}
    </p>
  );
}
