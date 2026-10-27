import Link from 'next/link';
import { Logo } from './Header';

export default function Footer() {
  return (
    <footer className="border-t border-line bg-cream/60">
      <div className="max-w-[1200px] mx-auto px-5 md:px-8 py-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <Logo />
          <nav className="flex flex-wrap items-center gap-6 font-mono text-[12px] text-inksoft">
            <Link href="/#bots" className="hover:text-ink transition-colors">bots</Link>
            <Link href="/#how" className="hover:text-ink transition-colors">how</Link>
            <Link href="/#computer" className="hover:text-ink transition-colors">computer</Link>
            <Link href="/#pricing" className="hover:text-ink transition-colors">pricing</Link>
            <Link href="https://github.com/tamago-labs/wayfind" target="_blank" rel="noopener noreferrer" className="hover:text-ink transition-colors">github</Link>
            <Link href="https://x.com/WayfindZZZ" target="_blank" rel="noopener noreferrer" className="hover:text-ink transition-colors">x</Link>
          </nav>
        </div>
        <p className="font-mono text-[10.5px] text-inksoft leading-relaxed mt-8 max-w-3xl">
          Wayfind Cloud is in early access. Chats, computer panels and routines shown on this page are
          illustrative until real Bots are running. Planned pricing is not on sale yet. Nothing here
          promises an always-on computer — it suspends when idle and checkpoints its work.
        </p>
        <p className="font-mono text-[10.5px] text-inksoft mt-3">© 2026 Tamago Labs · Wayfind Cloud</p>
      </div>
    </footer>
  );
}
