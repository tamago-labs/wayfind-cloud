import type { Metadata } from 'next';
import Link from 'next/link';
import { Callout, H2, P } from '@/components/docs/ui';
import { CHANGELOG } from '@/lib/changelog';

export const metadata: Metadata = {
  title: 'Changelog — Wayfind Docs',
  description: 'What’s new in Wayfind Cloud: latest features, improvements, and fixes.',
};

export default function DocsChangelogPage() {
  return (
    <article>
      <h1 className="font-brico text-4xl font-extrabold tracking-tight text-navy sm:text-5xl">Changelog</h1>
      <P>
        What’s new in Wayfind Cloud, newest first. Nothing here needs your action unless it says so.
      </P>

      {CHANGELOG.map((entry) => (
        <section key={entry.version} className="mt-10">
          <H2 id={`v${entry.version}`}>
            v{entry.version} <span className="text-base font-bold text-heroslate">· {entry.date}</span>
          </H2>
          <P><strong>{entry.tagline}</strong></P>
          {entry.added && entry.added.length > 0 && (
            <>
              <h3 className="mt-4 font-brico text-lg font-bold text-navy">Added</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-6 text-navy/80">
                {entry.added.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          )}
          {entry.changed && entry.changed.length > 0 && (
            <>
              <h3 className="mt-4 font-brico text-lg font-bold text-navy">Changed</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-6 text-navy/80">
                {entry.changed.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          )}
          {entry.fixed && entry.fixed.length > 0 && (
            <>
              <h3 className="mt-4 font-brico text-lg font-bold text-navy">Fixed</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-6 text-navy/80">
                {entry.fixed.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      ))}

      <Callout kind="tip">
        Just getting started? The{' '}
        <Link href="/docs/quickstart" className="font-bold text-cta hover:underline">Quickstart</Link>{' '}
        takes you from signup to your first connected Bot in five steps.
      </Callout>
    </article>
  );
}
