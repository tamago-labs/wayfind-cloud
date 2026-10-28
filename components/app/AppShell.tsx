'use client';

import { useEffect, useRef, useState } from 'react';
import { Menu } from 'lucide-react';
import Mascot from '@/components/Mascot';
import Roster from './Roster';
import Thread from './Thread';
import Composer from './Composer';
import { newBotColors, newBotShapes, seedBots, type Msg, type SeedBot } from './seed';

const FOLLOW_UP_NO = 'Okay, I’ve held it. Tell me what to change.';
const SIMULATED_REPLY = 'On it. I’ll message you here when it’s done, and ask before anything irreversible.';

export default function AppShell() {
  const [bots, setBots] = useState<SeedBot[]>(seedBots);
  const [cur, setCur] = useState(0);
  const [query, setQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const timers = useRef<number[]>([]);
  const newCount = useRef(0);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const bot = bots[cur] ?? bots[0];

  const patchBot = (index: number, fn: (b: SeedBot) => SeedBot) =>
    setBots((prev) => prev.map((b, i) => (i === index ? fn(b) : b)));

  const send = () => {
    const v = draft.trim();
    if (!v) return;
    setDraft('');
    patchBot(cur, (b) => ({ ...b, busy: true, msgs: [...b.msgs, { t: 'u', x: v }, { t: 'typing' }] }));
    timers.current.push(
      window.setTimeout(() => {
        patchBot(cur, (b) => ({
          ...b,
          msgs: [...b.msgs.filter((m) => m.t !== 'typing'), { t: 'tool', x: 'Using the computer · browser' }],
        }));
      }, 900),
      window.setTimeout(() => {
        patchBot(cur, (b) => ({
          ...b,
          busy: false,
          msgs: [...b.msgs, { t: 'b', x: SIMULATED_REPLY }],
        }));
      }, 2000),
    );
  };

  const approve = (msgIndex: number, ok: boolean) => {
    patchBot(cur, (b) => {
      const target = b.msgs[msgIndex];
      if (!target || target.t !== 'ask' || target.done !== undefined) return b;
      const follow: Msg = { t: 'b', x: ok ? target.after : FOLLOW_UP_NO };
      const msgs = b.msgs.map((m, j) =>
        j === msgIndex && m.t === 'ask' ? { ...m, done: (ok ? 'ok' : 'no') as const } : m,
      );
      return { ...b, msgs: [...msgs, follow] };
    });
  };

  const newBot = () => {
    const n = newCount.current++;
    const fresh: SeedBot = {
      name: 'New Bot',
      role: 'No job yet',
      color: newBotColors[n % newBotColors.length],
      shape: newBotShapes[n % newBotShapes.length],
      busy: false,
      msgs: [{ t: 'b', x: 'Hi! Give me my job in your first message: what to do, what never to do, and what to remember.' }],
    };
    setBots((prev) => [fresh, ...prev]);
    setCur(0);
    setSideOpen(false);
  };

  const q = query.toLowerCase();
  const items = bots
    .map((b, index) => ({ bot: b, index }))
    .filter(({ bot }) => !q || `${bot.name}${bot.role}`.toLowerCase().includes(q));

  return (
    <div className="flex h-screen overflow-hidden bg-ice font-brico text-navy">
      <Roster
        items={items}
        cur={cur}
        onSelect={(i) => {
          setCur(i);
          setSideOpen(false);
        }}
        query={query}
        onQuery={setQuery}
        showSearch={showSearch}
        onToggleSearch={() => setShowSearch((s) => !s)}
        onNew={newBot}
        open={sideOpen}
        onClose={() => setSideOpen(false)}
      />

      <main className="flex min-w-0 flex-1 flex-col bg-thread">
        <header className="relative flex items-center px-4 py-3.5">
          <button
            onClick={() => setSideOpen(true)}
            aria-label="Open Bots"
            className="grid h-9 w-9 place-items-center rounded-full bg-white text-navy shadow-sm md:hidden"
          >
            <Menu className="h-4 w-4" strokeWidth={2.2} />
          </button>
          <span className="hidden w-40 md:block" />
          <div className="mx-auto flex items-center gap-2.5 rounded-full bg-white py-2 pl-3 pr-5 font-bold text-navy shadow-md shadow-navy/5">
            <Mascot color={bot.color} shape={bot.shape} size="xs" motion="none" />
            <span>{bot.name}</span>
            <span className="hidden text-sm font-medium text-heroslate sm:inline">· {bot.role}</span>
          </div>

        </header>

        <Thread bot={bot} onApprove={approve} />
        <Composer botName={bot.name} draft={draft} onDraft={setDraft} onSend={send} />
      </main>
    </div>
  );
}
