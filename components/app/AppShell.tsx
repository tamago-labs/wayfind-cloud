'use client';

import { useEffect, useRef, useState } from 'react';
import { Menu, PanelRight } from 'lucide-react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import Mascot, { type MascotColor, type MascotShape } from '@/components/Mascot';
import Roster from './Roster';
import NewBotModal from './Roster/NewBotModal';
import BotPanel, { type BotEdits } from './BotPanel';
import Thread from './Thread';
import Composer from './Composer';
import { answerQuestion, decideApproval, getHistory, postTask, streamRun } from '@/lib/agent';
import { newBotColors, newBotShapes, type Msg, type SeedBot } from './seed';

const dataClient = generateClient<Schema>();

const FOLLOW_UP_NO = 'Okay, I’ve held it. Tell me what to change.';

const validColors: MascotColor[] = ['amber', 'moss', 'lagoon', 'ash', 'blue'];
const validShapes: MascotShape[] = ['blob', 'circle', 'squircle', 'pebble'];
const GREETING: Msg = { t: 'b', x: 'Hi! Give me my job in your first message: what to do, what never to do, and what to remember.' };

type ViewBot = SeedBot & { id: string | null };

export default function AppShell() {
  const { user } = useAuthenticator();
  const [bots, setBots] = useState<ViewBot[]>([]);
  const [cur, setCur] = useState(0);
  const [query, setQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [botModalOpen, setBotModalOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const newCount = useRef(0);

  // Roster comes from the database; seed.ts stays as shape reference only.
  useEffect(() => {
    const ownerId = user?.userId;
    if (!ownerId) return;
    let alive = true;
    void (async () => {
      try {
        const { data } = await dataClient.models.Bot.botsByOwnerId({ ownerId });
        if (!alive) return;
        setBots(
          (data ?? []).map((b) => ({
            id: b.id,
            name: b.name,
            role: b.role,
            color: validColors.includes(b.color as MascotColor) ? (b.color as MascotColor) : 'amber',
            shape: validShapes.includes(b.shape as MascotShape) ? (b.shape as MascotShape) : 'blob',
            busy: false,
            msgs: [],
          })),
        );
        setCur(0);
      } catch (err) {
        // roster stays empty; user can create the first Bot
        console.error('[AppShell] bots fetch failed:', err);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.userId]);

  // Hydrate per-bot history from the agent server (each Bot id is its conversation).
  useEffect(() => {
    const b = bots[cur];
    if (!b?.id || b.msgs.length > 0) return;
    let alive = true;
    void (async () => {
      try {
        const history = await getHistory(b.id as string);
        if (!alive || history.length === 0) return;
        patchBot(cur, (prev) =>
          prev.msgs.length > 0
            ? prev
            : {
                ...prev,
                msgs: history.map((m) => ({ t: m.role === 'assistant' ? ('b' as const) : ('u' as const), x: m.text })),
              },
        );
      } catch (err) {
        // history stays empty; the thread shows the greeting
        console.error('[AppShell] history fetch failed:', err);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, bots[cur]?.id, bots[cur]?.msgs.length]);

  const bot = bots[cur] ?? bots[0];

  const patchBot = (index: number, fn: (b: ViewBot) => ViewBot) =>
    setBots((prev) => prev.map((b, i) => (i === index ? fn(b) : b)));

  const send = () => {
    const v = draft.trim();
    if (!v || !bot || bot.busy) return;
    const targetIndex = cur;
    const targetId = bot.id;
    const targetName = bot.name;
    const targetRole = bot.role;
    setDraft('');
    patchBot(targetIndex, (b) => ({ ...b, busy: true, msgs: [...b.msgs, { t: 'u', x: v }, { t: 'typing' }] }));
    void (async () => {
      const finish = (fn: (b: ViewBot) => ViewBot) => patchBot(targetIndex, (b) => ({ ...fn(b), busy: false }));
      try {
        const system = targetId ? `You are "${targetName}". Role: ${targetRole}.` : undefined;
        const runId = await postTask(v, targetId ?? undefined, system);
        await streamRun(runId, {
          onChunk: (delta) =>
            patchBot(targetIndex, (b) => {
              const msgs = b.msgs.filter((m) => m.t !== 'typing');
              const last = msgs[msgs.length - 1];
              if (last && last.t === 'b') msgs[msgs.length - 1] = { t: 'b', x: last.x + delta };
              else msgs.push({ t: 'b', x: delta });
              return { ...b, msgs };
            }),
          onAgent: (name) =>
            patchBot(targetIndex, (b) => {
              const msgs = b.msgs.filter((m) => m.t !== 'typing');
              const row: Msg = { t: 'tool', x: `Using the computer · ${name}` };
              const last = msgs[msgs.length - 1];
              if (last && last.t === 'tool') msgs[msgs.length - 1] = row;
              else msgs.push(row);
              return { ...b, msgs };
            }),
          onQuestion: (q) =>
            patchBot(targetIndex, (b) => ({
              ...b,
              msgs: [
                ...b.msgs.filter((m) => m.t !== 'typing'),
                { t: 'q', qid: q.qid, questions: q.questions },
              ],
            })),
          onApproval: (a) =>
            patchBot(targetIndex, (b) => ({
              ...b,
              msgs: [
                ...b.msgs.filter((m) => m.t !== 'typing'),
                {
                  t: 'ask',
                  title: 'Approval needed',
                  x: `${a.permission ?? 'tool'}: ${a.target ?? ''}`,
                  ok: 'Approve',
                  after: 'Approved — continuing.',
                  approvalId: a.approvalId,
                },
              ],
            })),
        });
        patchBot(targetIndex, (b) => ({ ...b, busy: false }));
      } catch (err) {
        console.error('[AppShell] agent send failed:', err);
        finish((b) => ({
          ...b,
          msgs: [...b.msgs.filter((m) => m.t !== 'typing'), { t: 'b', x: 'Hmm, that run failed. Is the computer server running? Try again.' }],
        }));
      }
    })();
  };

  const approve = (msgIndex: number, ok: boolean) => {
    patchBot(cur, (b) => {
      const target = b.msgs[msgIndex];
      if (!target || target.t !== 'ask' || target.done !== undefined) return b;
      const follow: Msg = { t: 'b', x: ok ? target.after : FOLLOW_UP_NO };
      const msgs = b.msgs.map((m, j) =>
        j === msgIndex && m.t === 'ask' ? { ...m, done: ok ? ('ok' as const) : ('no' as const) } : m,
      );
      return { ...b, msgs: [...msgs, follow] };
    });
    // Server-backed approval: tell the parked run to resume (or stop).
    const target = bot?.msgs[msgIndex];
    if (target && target.t === 'ask' && target.approvalId) {
      const approvalId = target.approvalId;
      void decideApproval(approvalId, ok ? 'approve' : 'reject').catch((err) =>
        console.error('[AppShell] approval decision failed:', err),
      );
    }
  };

  const answer = (msgIndex: number, answers: string[][]) => {
    patchBot(cur, (b) => {
      const target = b.msgs[msgIndex];
      if (!target || target.t !== 'q' || target.done) return b;
      return { ...b, msgs: b.msgs.map((m, j) => (j === msgIndex && m.t === 'q' ? { ...m, done: true as const } : m)) };
    });
    const target = bot?.msgs[msgIndex];
    if (target && target.t === 'q') {
      const qid = target.qid;
      void answerQuestion(qid, answers).catch((err) => console.error('[AppShell] answer failed:', err));
    }
  };

  // Returns an error message on failure, null on success.
  const saveBotEdits = async (edits: BotEdits): Promise<string | null> => {    const target = bots[cur];
    if (!target) return 'No Bot selected.';
    if (!target.id) {
      patchBot(cur, (b) => ({ ...b, ...edits }));
      return null;
    }
    try {
      const { errors } = await dataClient.models.Bot.update({ id: target.id, ...edits });
      if (errors?.length) {
        const msg = errors.map((e) => e.message).join('; ');
        console.error('[AppShell] bot update failed:', msg);
        return msg;
      }
      patchBot(cur, (b) => ({ ...b, ...edits }));
      return null;
    } catch (err) {
      console.error('[AppShell] bot update failed:', err);
      return err instanceof Error ? err.message : 'Save failed. Check your connection and try again.';
    }
  };

  // Returns an error message on failure, null on success.
  const deleteBot = async (): Promise<string | null> => {
    const target = bots[cur];
    if (!target) return 'No Bot selected.';
    if (target.id) {
      try {
        const { errors } = await dataClient.models.Bot.delete({ id: target.id });
        if (errors?.length) {
          const msg = errors.map((e) => e.message).join('; ');
          console.error('[AppShell] bot delete failed:', msg);
          return msg;
        }
      } catch (err) {
        console.error('[AppShell] bot delete failed:', err);
        return err instanceof Error ? err.message : 'Delete failed. Check your connection and try again.';
      }
    }
    setBots((prev) => prev.filter((_, i) => i !== cur));
    setCur((c) => Math.max(0, c - 1));
    setPanelOpen(false);
    return null;
  };

  // Returns an error message on failure, null on success.
  const createBot = async (name: string): Promise<string | null> => {
    const ownerId = user?.userId;
    if (!ownerId) return 'Not signed in. Please sign in again.';
    const n = newCount.current++;
    const color = newBotColors[n % newBotColors.length];
    const shape = newBotShapes[n % newBotShapes.length];
    try {
      const { data, errors } = await dataClient.models.Bot.create({
        ownerId,
        name,
        role: 'No job yet',
        color,
        shape,
        status: 'active',
      });
      if (errors?.length || !data) {
        const msg = errors?.map((e) => e.message).join('; ') || 'Create failed with no error detail.';
        console.error('[AppShell] bot create failed:', msg);
        return msg;
      }
      console.log('[AppShell] bot created:', data.id);
      setBots((prev) => [{ id: data.id, name, role: 'No job yet', color, shape, busy: false, msgs: [] }, ...prev]);
      setCur(0);
      setSideOpen(false);
      return null;
    } catch (err) {
      console.error('[AppShell] bot create failed:', err);
      return err instanceof Error ? err.message : 'Create failed. Check your connection and try again.';
    }
  };

  const q = query.toLowerCase();
  const items = bots
    .map((b, index) => ({ bot: b, index }))
    .filter(({ bot }) => !q || `${bot.name}${bot.role}`.toLowerCase().includes(q));

  if (!bot) {
    return (
      <div className="flex h-screen overflow-hidden bg-ice font-brico text-navy">
        <Roster
          items={[]}
          cur={0}
          onSelect={() => {}}
          query={query}
          onQuery={setQuery}
          showSearch={showSearch}
          onToggleSearch={() => setShowSearch((s) => !s)}
          onNew={() => setBotModalOpen(true)}
          open={sideOpen}
          onClose={() => setSideOpen(false)}
        />
        <main className="grid min-w-0 flex-1 place-items-center bg-thread">
          <div className="text-center">
            <p className="text-xl font-bold">No Bots yet</p>
            <p className="mt-1 text-sm text-heroslate">Name your first Bot to get started.</p>
            <button
              onClick={() => setBotModalOpen(true)}
              className="mt-4 rounded-full bg-cta px-6 py-2.5 text-sm font-bold text-white hover:bg-ctahover"
            >
              Create your first Bot
            </button>
          </div>
        </main>
        <NewBotModal open={botModalOpen} onClose={() => setBotModalOpen(false)} onCreate={createBot} taken={bots.map((b) => b.name)} />
      </div>
    );
  }

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
        onNew={() => setBotModalOpen(true)}
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
          <button
            onClick={() => setPanelOpen((o) => !o)}
            aria-expanded={panelOpen}
            aria-label="Bot settings"
            className="mx-auto flex items-center gap-2.5 rounded-full bg-white py-2 pl-3 pr-5 font-bold text-navy shadow-md shadow-navy/5 hover:bg-slate-50"
          >
            <Mascot color={bot.color} shape={bot.shape} size="xs" motion="none" />
            <span>{bot.name}</span>
            <span className="hidden text-sm font-medium text-heroslate sm:inline">· {bot.role}</span>
          </button>
          <button
            onClick={() => setPanelOpen((o) => !o)}
            aria-label="Bot settings"
            aria-expanded={panelOpen}
            className="grid h-9 w-9 place-items-center rounded-full bg-white text-navy shadow-sm hover:bg-slate-50"
          >
            <PanelRight className="h-4 w-4" strokeWidth={2.2} />
          </button>

        </header>

        <div className="mx-4 mb-1 flex items-center justify-center gap-2 rounded-full bg-bamber/25 px-4 py-1.5 text-center text-xs font-bold text-navy">
          Local dev — replies come from your computer server. Make sure it’s running on :8080.
        </div>
        <Thread bot={bot} onApprove={approve} onAnswer={answer} />
        <Composer botName={bot.name} draft={draft} onDraft={setDraft} onSend={send} />
      </main>

      <BotPanel
        key={bot.id ?? `local-${cur}`}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        botId={bot.id}
        name={bot.name}
        role={bot.role}
        color={bot.color}
        shape={bot.shape}
        synced={bot.id !== null}
        onSave={saveBotEdits}
        onDelete={deleteBot}
      />
      <NewBotModal open={botModalOpen} onClose={() => setBotModalOpen(false)} onCreate={createBot} taken={bots.map((b) => b.name)} />
    </div>
  );
}
