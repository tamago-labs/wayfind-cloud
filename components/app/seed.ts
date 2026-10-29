import type { MascotColor, MascotShape } from '@/components/Mascot';

export type Msg =
  | { t: 'u'; x: string }
  | { t: 'b'; x: string }
  | { t: 'tool'; x: string }
  | { t: 'typing' }
  | { t: 'ask'; title: string; x: string; ok: string; after: string; done?: 'ok' | 'no'; approvalId?: string };

export interface SeedBot {
  name: string;
  role: string;
  color: MascotColor;
  shape: MascotShape;
  busy: boolean;
  msgs: Msg[];
}

/** Demo roster mirroring wayfind-app.html. Local state only — backend wiring comes later. */
export const seedBots: SeedBot[] = [
  {
    name: 'Amber',
    role: 'Chief of staff',
    color: 'amber',
    shape: 'blob',
    busy: false,
    msgs: [
      { t: 'u', x: 'Your job is inbox triage. Never send anything without asking me.' },
      { t: 'b', x: 'Got it. Saved as a lasting rule.' },
      { t: 'tool', x: 'Used Gmail · read 14 new emails' },
      { t: 'b', x: '3 emails need replies. I drafted all three and left them in your drafts folder.' },
      {
        t: 'ask',
        title: 'Approval needed',
        x: 'Send 3 replies from Gmail?',
        ok: 'Send 3 replies',
        after: 'Sent. I’ll check for answers tomorrow morning.',
      },
    ],
  },
  {
    name: 'Moss',
    role: 'Expense manager',
    color: 'moss',
    shape: 'circle',
    busy: true,
    msgs: [
      { t: 'u', x: 'Match this month’s receipts to the card statement.' },
      { t: 'tool', x: 'Using the computer · browser, Receipts folder' },
      { t: 'b', x: '23 matched so far. 2 receipts are missing. I’m checking the vendors’ emails next.' },
    ],
  },
  {
    name: 'Lagoon',
    role: 'Talent scout',
    color: 'lagoon',
    shape: 'squircle',
    busy: false,
    msgs: [
      { t: 'u', x: 'Find 10 senior designers in Bangkok. Draft intros, don’t send.' },
      { t: 'b', x: 'Found 10 profiles and wrote 10 drafts. Ready for your review.' },
      {
        t: 'ask',
        title: 'Approval needed',
        x: 'Send 10 intro messages?',
        ok: 'Send intros',
        after: 'Sent. I’ll watch for replies.',
      },
    ],
  },
  {
    name: 'Ash',
    role: 'Bug reproduction',
    color: 'ash',
    shape: 'pebble',
    busy: true,
    msgs: [
      { t: 'u', x: 'Reproduce bug 212 and attach the steps to the ticket.' },
      { t: 'tool', x: 'Using the computer · terminal' },
      { t: 'b', x: 'Reproduced on the second try. Writing up the steps now.' },
    ],
  },
  {
    name: 'Researcher',
    role: 'Weekly brief',
    color: 'blue',
    shape: 'circle',
    busy: false,
    msgs: [{ t: 'b', x: 'Your daily brief routine ran at 8:00. 3 items need a decision today.' }],
  },
];

export const newBotColors: MascotColor[] = ['amber', 'moss', 'lagoon', 'ash', 'blue'];
export const newBotShapes: MascotShape[] = ['blob', 'circle', 'squircle', 'pebble'];

export function lastPreview(b: SeedBot): string {
  const m = [...b.msgs].reverse().find((m) => m.t === 'b' || m.t === 'u' || m.t === 'ask');
  if (!m) return 'New Bot';
  return m.x;
}
