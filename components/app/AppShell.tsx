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
import SkillsPickerModal from './SkillsPickerModal';
import Thread from './Thread';
import Composer from './Composer';
import { answerBotRequest, answerQuestion, decideApproval, getHistory, pollPending, postTask, streamRun, summarizeRole } from '@/lib/agent';
import { getTransport, TRANSPORT_EVENT } from '@/lib/transport';
import { isImageProgress, newBotColors, newBotShapes, type Msg, type SeedBot } from './seed';

const dataClient = generateClient<Schema>();

const FOLLOW_UP_NO = 'Okay, I’ve held it. Tell me what to change.';

const validColors: MascotColor[] = ['amber', 'moss', 'lagoon', 'ash', 'blue'];
const validShapes: MascotShape[] = ['blob', 'circle', 'squircle', 'pebble'];
const GREETING: Msg = { t: 'b', x: 'Hi! Give me my role in your first message: what to do, what never to do, and what to remember.' };

type ViewBot = SeedBot & { id: string | null; isChiefOfStaff: boolean; skillsEnabled: string[] | null };

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
  const [skillsOpen, setSkillsOpen] = useState(false);
  // Chat transport mirror of the RosterFooter toggle (local :8080 vs cloud
  // VM). Re-renders the banner on flip via the shared transport event.
  const [transport, setTransport] = useState<'local' | 'cloud'>('local');
  useEffect(() => {
    setTransport(getTransport());
    const onChange = () => setTransport(getTransport());
    window.addEventListener(TRANSPORT_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(TRANSPORT_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  // Roster comes from the database; seed.ts stays as shape reference only.
  // Re-runs on sign-in and whenever a bot is seeded/changed elsewhere
  // (e.g. RosterFooter auto-creates the first "Wayfind" bot after signup).
  useEffect(() => {
    const ownerId = user?.userId;
    if (!ownerId) return;
    let alive = true;
    const fetchBots = async () => {
      try {
        const { data } = await dataClient.models.Bot.botsByOwnerId({ ownerId });
        if (!alive) return;
        setBots(
          (data ?? []).map((b) => ({
            id: b.id,
            name: b.name,
            role: b.role ?? '',
            isChiefOfStaff: b.isChiefOfStaff ?? false,
            skillsEnabled: (b.skillsEnabled as string[] | null | undefined) ?? null,
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
    };
    void fetchBots();
    const onChanged = () => void fetchBots();
    window.addEventListener('wayfind:bots-changed', onChanged);
    return () => {
      alive = false;
      window.removeEventListener('wayfind:bots-changed', onChanged);
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
                    // Drop stale image-progress rows — the skeleton only
                    // lives while a run is in flight.
                    msgs: history
                      .filter((m) => !(m.role === 'tool' && isImageProgress(m.text)))
                      .map((m) =>
                    m.role === 'assistant'
                      ? { t: 'b' as const, x: m.text }
                      : m.role === 'tool'
                        ? { t: 'tool' as const, x: m.text }
                        : { t: 'u' as const, x: m.text },
                  ),
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

  // Index-stable patching for in-flight runs: roster inserts (chief-created
  // bots prepend) shift indices mid-stream, so everything after the
  // synchronous optimistic update patches by bot id.
  const patchBotById = (id: string, fn: (b: ViewBot) => ViewBot) =>
    setBots((prev) => prev.map((b) => (b.id === id ? fn(b) : b)));

  const send = (attachments: string[] = []) => sendText(draft, attachments);

  const sendText = (raw: string, attachments: string[] = []) => {
    const v = raw.trim();
    if ((!v && attachments.length === 0) || !bot || bot.busy) return;
    const targetIndex = cur;
    const targetId = bot.id;
    const targetName = bot.name;
    const targetRole = bot.role;
    const targetIsChief = bot.isChiefOfStaff;
    const targetSkills = bot.skillsEnabled;
    setDraft('');
    patchBot(targetIndex, (b) => ({
      ...b,
      busy: true,
      msgs: [...b.msgs, { t: 'u', x: v || '(attached files)', ...(attachments.length > 0 ? { files: attachments } : {}) }, { t: 'typing' }],
    }));
    // Stable identity for the whole run: roster inserts shift indices, so
    // every patch below keys on the bot id. Falls back to the captured
    // index only when the bot has no id yet (local-only, pre-save).
    const patchTarget = (fn: (b: ViewBot) => ViewBot) =>
      targetId ? patchBotById(targetId, fn) : patchBot(targetIndex, fn);
    void (async () => {
      const finish = (fn: (b: ViewBot) => ViewBot) => patchTarget((b) => ({ ...fn(b), busy: false }));
      try {
        const system = targetId
          ? targetRole
            ? `You are "${targetName}". Role: ${targetRole}.`
            : `You are "${targetName}". Your role is not defined yet.`
          : undefined;
        const runId = await postTask(v, targetId ?? undefined, system, targetSkills ?? undefined, {
          canManageBots: targetIsChief,
          // Chief-only: the model sees the roster so it can propose bots and @mention them.
          roster: targetIsChief
            ? bots
                .filter((b) => b.id)
                .map((b) => ({ id: b.id as string, name: b.name, role: b.role, skills: b.skillsEnabled }))
            : undefined,
          botName: targetName,
          ...(attachments.length > 0 ? { attachments } : {}),
          ...(user?.userId ? { ownerId: user.userId } : {}),
        });
        // One handler set feeds both the SSE stream and the pending-poll
        // below, so a parked run surfaces its card even when the stream is
        // buffered (cloud relay delivers events only at done). Each card is
        // id-keyed: poll + stream doubles are dropped, not duplicated.
        const onChunk = (delta: string) =>
          patchTarget((b) => {
            const msgs = b.msgs.filter((m) => m.t !== 'typing');
            const last = msgs[msgs.length - 1];
            if (last && last.t === 'b') msgs[msgs.length - 1] = { t: 'b', x: last.x + delta };
            else msgs.push({ t: 'b', x: delta });
            return { ...b, msgs };
          });
        const onAgent = (name: string) =>
          patchTarget((b) => {
            const msgs = b.msgs.filter((m) => m.t !== 'typing');
            const row: Msg = { t: 'tool', x: `${name}` };
            const last = msgs[msgs.length - 1];
            if (last && last.t === 'tool') msgs[msgs.length - 1] = row;
            else msgs.push(row);
            return { ...b, msgs };
          });
        const onQuestion = (q: { qid: string; questions: { question: string; header?: string; options: { label: string; description?: string }[] }[] }) =>
          patchTarget((b) => {
            if (b.msgs.some((m) => m.t === 'q' && m.qid === q.qid)) return b;
            return {
              ...b,
              msgs: [
                ...b.msgs.filter((m) => m.t !== 'typing'),
                { t: 'q', qid: q.qid, questions: q.questions },
              ],
            };
          });
        const onApproval = (a: { approvalId: string; permission?: string; target?: string }) =>
          patchTarget((b) => {
            if (b.msgs.some((m) => m.t === 'ask' && m.approvalId === a.approvalId)) return b;
            return {
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
            };
          });
        const onBotRequest = (r: { bid: string; botName: string; botRole?: string; botDescription?: string }) =>
          patchTarget((b) => {
            if (b.msgs.some((m) => m.t === 'botreq' && m.bid === r.bid)) return b;
            return {
              ...b,
              msgs: [
                ...b.msgs.filter((m) => m.t !== 'typing'),
                { t: 'botreq', bid: r.bid, name: r.botName, role: r.botRole, description: r.botDescription },
              ],
            };
          });
        const pollTimer = setInterval(() => void pollPending(runId, { onApproval, onQuestion, onBotRequest }), 2500);
        try {
          await streamRun(runId, { onChunk, onAgent, onQuestion, onApproval, onBotRequest });
        } finally {
          clearInterval(pollTimer);
        }
        // Run finished — drop any image-progress skeleton rows; the
        // finished image arrives as markdown in the final message.
        patchTarget((b) => ({
          ...b,
          busy: false,
          msgs: b.msgs.filter((m) => !(m.t === 'tool' && isImageProgress(m.x))),
        }));
        // First chat defines the role: AI compresses the user's job
        // description into a short label and saves it (manual edits win —
        // this only fires while the role is still empty, never for the chief).
        if (targetId && !targetRole && !targetIsChief) {
          void (async () => {
            try {
              const role = await summarizeRole(v, user?.userId);
              if (!role) return;
              const { errors } = await dataClient.models.Bot.update({ id: targetId, role });
              if (errors?.length) return;
              patchTarget((b) => (b.role ? b : { ...b, role }));
            } catch (err) {
              console.error('[AppShell] role summarize failed:', err);
            }
          })();
        }
      } catch (err) {
        // Surface the real failure (e.g. the SDK serialize message) instead
        // of a generic line — the user can paste it straight back for debug.
        const detail = err instanceof Error ? err.message : String(err);
        console.error('[AppShell] agent send failed:', detail);
        finish((b) => ({
          ...b,
          msgs: [...b.msgs.filter((m) => m.t !== 'typing'), { t: 'b', x: `That run failed: ${detail.slice(0, 300)}` }],
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
  const saveBotSkills = (enabled: string[] | null) => {
    const target = bots[cur];
    if (!target) return;
    patchBot(cur, (b) => ({ ...b, skillsEnabled: enabled }));
    // Backend may lag the schema push — apply locally first, sync best-effort.
    if (target.id) {
      void dataClient.models.Bot.update({ id: target.id, skillsEnabled: enabled }).catch((err) =>
        console.error('[AppShell] skills sync failed (applies next sandbox push):', err),
      );
    }
  };

  // Returns an error message on failure, null on success.
  const saveBotEdits = async (edits: BotEdits): Promise<string | null> => {    const target = bots[cur];
    if (!target) return 'No Bot selected.';
    // Chief always carries the chief role unless the user wrote something else.
    const normalized = edits.isChiefOfStaff && !edits.role.trim() ? { ...edits, role: 'Chief of staff' } : edits;
    if (!target.id) {
      patchBot(cur, (b) => ({ ...b, ...normalized }));
      return null;
    }
    try {
      // One chief of staff per user: unset the flag everywhere else first.
      if (normalized.isChiefOfStaff && !target.isChiefOfStaff) {
        const others = bots.filter((b) => b.isChiefOfStaff && b.id && b.id !== target.id);
        for (const o of others) {
          await dataClient.models.Bot.update({ id: o.id as string, isChiefOfStaff: false });
        }
        if (others.length > 0) {
          const ids = new Set(others.map((o) => o.id));
          setBots((prev) => prev.map((b) => (b.id && ids.has(b.id) ? { ...b, isChiefOfStaff: false } : b)));
        }
      }
      const { errors } = await dataClient.models.Bot.update({ id: target.id, ...normalized });
      if (errors?.length) {
        const msg = errors.map((e) => e.message).join('; ');
        console.error('[AppShell] bot update failed:', msg);
        return msg;
      }
      patchBot(cur, (b) => ({ ...b, ...normalized }));
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

  // Core Bot insert (no navigation). Returns the created id or an error message.
  const insertBot = async (
    name: string,
    isChief: boolean,
    role?: string,
    description?: string,
  ): Promise<{ botId: string | null; error: string | null }> => {
    const ownerId = user?.userId;
    if (!ownerId) return { botId: null, error: 'Not signed in. Please sign in again.' };
    // Random look, avoiding combos already in the roster so new bots don't twin.
    const used = new Set(bots.map((b) => `${b.color}/${b.shape}`));
    const combos = newBotColors.flatMap((color) => newBotShapes.map((shape) => ({ color, shape })));
    const free = combos.filter((c) => !used.has(`${c.color}/${c.shape}`));
    const pool = free.length > 0 ? free : combos;
    const { color, shape } = pool[Math.floor(Math.random() * pool.length)];
    try {
      // One chief of staff per user: unset the flag on the current chief first.
      if (isChief) {
        const prev = bots.find((b) => b.isChiefOfStaff && b.id);
        if (prev?.id) {
          await dataClient.models.Bot.update({ id: prev.id, isChiefOfStaff: false });
          patchBot(bots.indexOf(prev), (b) => ({ ...b, isChiefOfStaff: false }));
        }
      }
      const { data, errors } = await dataClient.models.Bot.create({
        ownerId,
        name,
        ...(isChief ? { role: 'Chief of staff', isChiefOfStaff: true } : {}),
        ...(!isChief && role ? { role } : {}),
        ...(!isChief && description ? { description } : {}),
        color,
        shape,
        status: 'active',
      });
      if (errors?.length || !data) {
        const msg = errors?.map((e) => e.message).join('; ') || 'Create failed with no error detail.';
        console.error('[AppShell] bot create failed:', msg);
        return { botId: null, error: msg };
      }
      console.log('[AppShell] bot created:', data.id);
      setBots((prev) => [
        { id: data.id, name, role: isChief ? 'Chief of staff' : (role ?? ''), isChiefOfStaff: isChief, skillsEnabled: null, color, shape, busy: false, msgs: [] },
        ...prev,
      ]);
      return { botId: data.id, error: null };
    } catch (err) {
      console.error('[AppShell] bot create failed:', err);
      return { botId: null, error: err instanceof Error ? err.message : 'Create failed. Check your connection and try again.' };
    }
  };

  // Returns an error message on failure, null on success.
  const createBot = async (name: string, isChief: boolean): Promise<string | null> => {
    const { error } = await insertBot(name, isChief);
    if (!error) {
      setCur(0);
      setSideOpen(false);
    }
    return error;
  };

  // Chief-proposed bot: confirm card → create without leaving the thread.
  // Name uniqueness is enforced here so the model retries with another name.
  const confirmBotRequest = (msgIndex: number, ok: boolean) => {
    const chief = bots[cur];
    const target = chief?.msgs[msgIndex];
    if (!chief?.id || !target || target.t !== 'botreq' || target.done !== undefined) return;
    const chiefId = chief.id;
    const bid = target.bid;
    // Locate the chief by id at patch time — insertBot prepends, shifting indices.
    const patchChief = (fn: (b: ViewBot) => ViewBot) =>
      setBots((prev) => {
        const i = prev.findIndex((b) => b.id === chiefId);
        return i < 0 ? prev : prev.map((b, j) => (j === i ? fn(b) : b));
      });
    if (!ok) {
      patchChief((b) => ({
        ...b,
        msgs: b.msgs.map((m, j) => (j === msgIndex && m.t === 'botreq' ? { ...m, done: 'cancelled' as const } : m)),
      }));
      void answerBotRequest(bid, { decision: 'cancel' }).catch((err) =>
        console.error('[AppShell] bot request cancel failed:', err),
      );
      return;
    }
    const nameTaken = bots.some((b) => b.name.toLowerCase() === target.name.toLowerCase());
    if (nameTaken) {
      const error = `A bot named "${target.name}" already exists — pick another name.`;
      patchChief((b) => ({
        ...b,
        msgs: b.msgs.map((m, j) => (j === msgIndex && m.t === 'botreq' ? { ...m, done: 'cancelled' as const } : m)),
      }));
      void answerBotRequest(bid, { decision: 'cancel', error }).catch((err) =>
        console.error('[AppShell] bot request resolve failed:', err),
      );
      return;
    }
    void (async () => {
      const { botId, error } = await insertBot(target.name, false, target.role, target.description);
      // insertBot prepends to the roster — shift selection so the chief thread stays open.
      setCur((c) => c + 1);
      const done: 'created' | 'cancelled' = botId ? 'created' : 'cancelled';
      patchChief((b) => ({
        ...b,
        msgs: b.msgs.map((m, j) => (j === msgIndex && m.t === 'botreq' ? { ...m, done } : m)),
      }));
      if (botId) void answerBotRequest(bid, { decision: 'confirm', botId }).catch((err) => console.error('[AppShell] bot request confirm failed:', err));
      else void answerBotRequest(bid, { decision: 'cancel', error: error ?? 'Create failed.' }).catch((err) => console.error('[AppShell] bot request resolve failed:', err));
    })();
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
            <span className="hidden text-sm font-medium text-heroslate sm:inline">· {bot.role || 'No role yet'}</span>
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

        {transport === 'cloud' ? (
          <div className="mx-4 mb-1 flex items-center justify-center gap-2 rounded-full bg-emerald-100/70 px-4 py-1.5 text-center text-xs font-bold text-emerald-900">
            Cloud — replies come from your cloud computer
            {typeof window !== 'undefined' && window.localStorage.getItem('wayfind-vm-endpoint')
              ? ` (${new URL(window.localStorage.getItem('wayfind-vm-endpoint') as string).hostname.slice(0, 24)}…)`
              : ' (no endpoint yet — start it below)'}
            .
          </div>
        ) : (
          <div className="mx-4 mb-1 flex items-center justify-center gap-2 rounded-full bg-bamber/25 px-4 py-1.5 text-center text-xs font-bold text-navy">
            Local dev — replies come from your computer server. Make sure it’s running on :8080.
          </div>
        )}
        <Thread bot={bot} onApprove={approve} onAnswer={answer} onBotRequest={confirmBotRequest} />
        <Composer
          botName={bot.name}
          draft={draft}
          onDraft={setDraft}
          onSend={send}
          onVoiceSend={sendText}
          onOpenSkills={() => setSkillsOpen(true)}
          ownerId={user?.userId}
          mentionNames={bot.isChiefOfStaff ? bots.filter((b) => b.id && b.id !== bot.id).map((b) => b.name) : []}
        />
      </main>

      <BotPanel
        key={bot.id ?? `local-${cur}`}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        botId={bot.id}
        name={bot.name}
        role={bot.role}
        isChiefOfStaff={bot.isChiefOfStaff}
        color={bot.color}
        shape={bot.shape}
        synced={bot.id !== null}
        onSave={saveBotEdits}
        onDelete={deleteBot}
      />
      <NewBotModal open={botModalOpen} onClose={() => setBotModalOpen(false)} onCreate={createBot} taken={bots.map((b) => b.name)} />
      <SkillsPickerModal
        open={skillsOpen}
        onClose={() => setSkillsOpen(false)}
        botName={bot.name}
        enabled={bot.skillsEnabled}
        onSave={saveBotSkills}
      />
    </div>
  );
}
