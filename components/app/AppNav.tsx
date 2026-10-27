'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Plus, Search, AppWindow, Sparkles, Clock3, Monitor, Settings, ArrowLeft, LogIn } from 'lucide-react';
import { Logo } from '@/components/landing/Header';
import { finders } from '@/components/landing/finders';

const secondary = [
  { href: '/app/apps', label: 'connect apps', icon: AppWindow },
  { href: '/app/skills', label: 'skills', icon: Sparkles },
  { href: '/app/routines', label: 'routines', icon: Clock3 },
  { href: '/app/computer', label: 'computer', icon: Monitor },
  { href: '/app/settings', label: 'settings', icon: Settings },
  { href: '/app/sign-in', label: 'sign in', icon: LogIn },
];

export default function AppNav() {
  const pathname = usePathname();
  const [queryBot, setQueryBot] = useState<string | null>(null);
  useEffect(() => {
    setQueryBot(new URLSearchParams(window.location.search).get('bot'));
  }, [pathname]);
  const activeBot = pathname.startsWith('/app/bots/')
    ? pathname.split('/')[3]
    : pathname === '/app'
      ? queryBot ?? finders[0].id
      : null;

  const botHref = (id: string) => `/app?bot=${id}`;

  return (
    <>
      {/* Roster sidebar — desktop */}
      <aside className="hidden md:flex w-[290px] shrink-0 flex-col border-r border-line bg-cream/60 min-h-screen sticky top-0 h-screen">
        <div className="px-5 h-16 flex items-center border-b border-line">
          <Logo />
        </div>

        <div className="px-4 pt-4 space-y-2">
          <Link
            href="/app/bots/new"
            className="w-full flex items-center justify-center gap-2 text-[13px] font-display font-medium bg-ink text-white px-4 py-2.5 rounded-xl hover:bg-accent transition-colors"
          >
            <Plus className="w-4 h-4" /> New Bot
          </Link>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 font-mono text-[11.5px] text-inksoft/70">
            <Search className="w-3.5 h-3.5" /> search bots, chats, files…
          </div>
          <p className="font-mono text-[10px] text-inksoft px-1">new bot + search activate with accounts</p>
        </div>

        <nav className="px-3 py-4 flex-1 overflow-y-auto">
          <p className="font-mono text-[10.5px] text-inksoft px-2 mb-2">your bots — starter roster</p>
          <div className="space-y-1">
            {finders.map((f) => {
              const active = activeBot === f.id;
              return (
                <Link
                  key={f.id}
                  href={botHref(f.id)}
                  className={`flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-colors ${active ? 'bg-ink text-white' : 'hover:bg-ink/5'}`}
                >
                  <img src={f.img} alt={f.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[13px] font-medium truncate ${active ? 'text-white' : 'text-ink'}`}>{f.name}</span>
                    <span className={`block font-mono text-[10px] truncate ${active ? 'text-white/50' : 'text-inksoft'}`}>{f.job} · template</span>
                  </span>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${active ? 'bg-accent2' : 'bg-ink/15'}`} />
                </Link>
              );
            })}
          </div>

          <p className="font-mono text-[10.5px] text-inksoft px-2 mt-6 mb-2">organise later: pin · sections · hide</p>

          <div className="space-y-1 mt-2">
            {secondary.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-mono text-[12.5px] transition-colors ${active ? 'bg-ink text-white' : 'text-inksoft hover:bg-ink/5 hover:text-ink'}`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="px-5 py-4 border-t border-line">
          <div className="flex items-center justify-between font-mono text-[11px]">
            <span className="text-inksoft">computer</span>
            <span className="px-2.5 py-1 rounded-full bg-warn2/15 text-[#a33]">not provisioned</span>
          </div>
          <p className="font-mono text-[10px] text-inksoft leading-relaxed mt-2">
            shared by all your Bots. gatekeeper opens with the backend phase.
          </p>
          <Link href="/" className="flex items-center gap-2 font-mono text-[11.5px] text-inksoft hover:text-ink transition-colors mt-3">
            <ArrowLeft className="w-3.5 h-3.5" /> back to site
          </Link>
        </div>
      </aside>

      {/* Mobile: top bar + roster chips */}
      <div className="md:hidden sticky top-0 z-40 bg-paper/95 backdrop-blur border-b border-line">
        <div className="px-5 h-14 flex items-center justify-between">
          <Logo />
          <span className="font-mono text-[10px] px-2.5 py-1 rounded-full bg-warn2/15 text-[#a33]">computer: off</span>
        </div>
        <div className="px-3 pb-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
          {finders.map((f) => (
            <Link
              key={f.id}
              href={botHref(f.id)}
              className={`flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border whitespace-nowrap ${activeBot === f.id ? 'bg-ink text-white border-ink' : 'border-line text-ink'}`}
            >
              <img src={f.img} alt={f.name} className="w-6 h-6 rounded-full object-cover" />
              <span className="text-[12px] font-medium">{f.name}</span>
            </Link>
          ))}
        </div>
        <nav className="px-3 pb-2 flex gap-1 overflow-x-auto scrollbar-hide">
          {secondary.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 rounded-lg font-mono text-[11px] whitespace-nowrap ${pathname === item.href ? 'bg-ink text-white' : 'text-inksoft'}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
