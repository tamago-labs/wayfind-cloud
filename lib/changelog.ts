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
    version: '1.2.0',
    date: '2026-11-13',
    tagline: 'Bots can now use crypto wallets, and the API powers verifiable sandbox runs.',
    added: [
      'Web3 Gateway connectors — Wallet Essentials, OKX DEX Swaps, and Stablecoin Finance. Open Connectors, pick one, and paste your endpoint from web3.wayfind.click, where email sign-in creates your wallet.',
      'Wayfind ONE backend — disposable attested sandboxes with sealed file intake, signed execution receipts, and verification endpoints, now running on this API.',
    ],
  },
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
