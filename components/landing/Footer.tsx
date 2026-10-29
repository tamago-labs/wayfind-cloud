import Link from 'next/link';
import { Logo } from './Header';

export default function Footer() {
  return (
    <footer className="border-t border-line bg-cream/60">
      <div className="max-w-[1200px] mx-auto px-5 md:px-8 py-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <Logo />
          <nav className="flex flex-wrap items-center gap-6 text-[14px] font-medium text-navy">
            <Link href="/#pricing" className="hover:opacity-60 transition-opacity">Pricing</Link>
            <Link href="/#faq" className="hover:opacity-60 transition-opacity">FAQ</Link>
            <Link href="https://github.com/tamago-labs/wayfind" target="_blank" rel="noopener noreferrer" className="hover:opacity-60 transition-opacity">github</Link>
            <Link href="https://x.com/WayfindZZZ" target="_blank" rel="noopener noreferrer" className="hover:opacity-60 transition-opacity">x</Link>
          </nav>
        </div>
        <p className="text-[12px] text-heroslate leading-relaxed mt-8 max-w-3xl">
          Wayfind Cloud is in early access. Chats, computer panels and routines shown on this page are
          illustrative until real Bots are running. Planned pricing is not on sale yet. Nothing here
          promises an always-on computer — it suspends when idle and checkpoints its work.
        </p>
        <p className="text-[12px] text-heroslate mt-3">© 2026 Tamago Labs</p>
      </div>
    </footer>
  );
}
