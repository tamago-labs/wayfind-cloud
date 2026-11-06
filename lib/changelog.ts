// User-facing changelog — single source for /docs/changelog.
// Plain words only: no internal codenames, no infra trivia.
// Newest entry first. Add a new entry per release (see docs plan:
// bump version -> entry here -> deploy -> push).
export interface ChangelogEntry {
  version: string;
  date: string;
  tagline: string;
  added?: string[];
  changed?: string[];
  fixed?: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.1.0',
    date: '2026-11-06',
    tagline: 'Member bots can now ask your chief of staff for help.',
    added: [
      'In any member bot’s chat you can @mention your chief of staff — they answer in their own role and the reply is relayed back to you.',
      'Your other bots stay hidden from members: each member bot only ever sees the chief.',
      'New greeting suggestion in member chats points at the chief when you need a hand.',
    ],
  },
];
