import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-border3/50 py-10">
      <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
        <p className="text-[12px] text-white/30">© 2026 Tamago Labs</p>
        <div className="flex items-center gap-6 text-[12px] text-white/30">
          <Link href="https://github.com/tamago-labs/wayfind" target="_blank" rel="noopener noreferrer" className="hover:text-white/60 transition-colors">GitHub</Link>
          <Link href="https://github.com/tamago-labs/wayfind-mcp" target="_blank" rel="noopener noreferrer" className="hover:text-white/60 transition-colors">MCP</Link>
          <Link href="https://github.com/tamago-labs/wayfind-skills" target="_blank" rel="noopener noreferrer" className="hover:text-white/60 transition-colors">Skills</Link>
          <Link href="https://x.com/WayfindZZZ" target="_blank" rel="noopener noreferrer" className="hover:text-white/60 transition-colors">Twitter/X</Link>
        </div>
      </div>
    </footer>
  );
}
