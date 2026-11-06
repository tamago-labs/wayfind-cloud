import Link from 'next/link';
import { Logo } from './Header';

export default function Footer() {
  return (
    <footer className="border-t border-line bg-cream/60">
      <div className="max-w-[1200px] mx-auto px-5 md:px-8 py-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <Logo />
          <nav className="flex flex-wrap items-center gap-6 text-[14px] font-medium text-navy">
            <Link href="/docs" className="hover:opacity-60 transition-opacity">Docs</Link>
            <Link href="/docs/changelog" className="hover:opacity-60 transition-opacity">Changelog</Link>
            <Link href="https://github.com/tamago-labs/wayfind-cloud" target="_blank" rel="noopener noreferrer" className="hover:opacity-60 transition-opacity">GitHub</Link>
            <Link href="https://x.com/WayfindCloud" target="_blank" rel="noopener noreferrer" className="hover:opacity-60 transition-opacity">X (former Twitter)</Link>
          </nav>
        </div>
        <p className="text-[12px] text-heroslate leading-relaxed mt-8 max-w-md">
          Wayfind provides always-on AI teammates in the cloud for small businesses. Powered by
          AWS infrastructure and Meta&apos;s open-weight AI models, your Bots help handle everyday
          business work around the clock.
        </p>
        <p className="text-[12px] text-heroslate mt-3">© 2026 Tamago Labs Japan</p>
      </div>
    </footer>
  );
}
