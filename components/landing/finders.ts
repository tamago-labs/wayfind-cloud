export interface Finder {
  id: string;
  name: string;
  trait: string;
  job: string;
  img: string;
  color: string;
  ring: string;
  chip: string;
  does: string;
  outcome: string;
  connectors: string[];
  starter: string;
  skill: { name: string; desc: string };
  routine: { name: string; when: string };
}

export const finders: Finder[] = [
  {
    id: 'inbox',
    name: 'Amber',
    trait: 'Warm Amber · Soft Fur',
    job: 'Inbox Manager',
    img: '/finders/inbox.webp',
    color: '#FFB020',
    ring: 'ring-[#FFB020]/50',
    chip: 'bg-[#FFB020]/15 text-[#8a5a00]',
    does: 'Triages your inbox overnight, drafts replies in your voice, and holds every send for your approval.',
    outcome: 'Wake up to “3 drafts ready, 12 archived, 1 needs you.”',
    connectors: ['Gmail', 'Calendar', 'Slack'],
    starter: 'Your job is my inbox. Every night, triage everything new, draft replies in my voice, and archive the noise. Never send or delete without my approval. Remember this.',
    skill: { name: 'Nightly inbox triage', desc: 'Triage, draft in my voice, hold sends, morning summary in chat.' },
    routine: { name: 'Morning brief', when: 'weekdays 07:00' },
  },
  {
    id: 'leads',
    name: 'Moss',
    trait: 'Fresh Green · Soft Fur',
    job: 'Lead Hunter',
    img: '/finders/leads.webp',
    color: '#5FBF3F',
    ring: 'ring-[#5FBF3F]/50',
    chip: 'bg-[#5FBF3F]/15 text-[#2f6b1c]',
    does: 'Finds and enriches prospects that match your ICP, scores them, and drafts outreach — never sends alone.',
    outcome: 'A fresh, scored lead list in your sheet every morning.',
    connectors: ['Web', 'Sheets', 'Notion'],
    starter: 'Your job is lead hunting. Find prospects that match my ICP, skip anyone already in my sheet, score them with evidence, and draft outreach in my voice. Drafts only - never contact anyone.',
    skill: { name: 'Weekly lead sweep', desc: 'Search, dedupe against sheet, score with sources, draft outreach.' },
    routine: { name: 'New leads digest', when: 'mondays 08:00' },
  },
  {
    id: 'research',
    name: 'Lagoon',
    trait: 'Lagoon Blue · Soft Fur',
    job: 'Research Watcher',
    img: '/finders/research.webp',
    color: '#2EC4D6',
    ring: 'ring-[#2EC4D6]/50',
    chip: 'bg-[#2EC4D6]/15 text-[#146c77]',
    does: 'Watches competitors, changelogs and sources you name, and alerts you only when something actually changes.',
    outcome: '“Competitor shipped pricing v2” — with the diff, not noise.',
    connectors: ['Web / RSS', 'Drive', 'Slack'],
    starter: 'Your job is watching my competitors and sources. Check them daily, and only message me when something actually changes - with the diff and a link. No noise.',
    skill: { name: 'Competitor change watch', desc: 'Snapshot sources, diff, alert with evidence only on real change.' },
    routine: { name: 'Daily watch', when: 'daily 06:30' },
  },
  {
    id: 'repo',
    name: 'Ash',
    trait: 'Cloud Grey · Soft Fur',
    job: 'Repo Coder',
    img: '/finders/repo.webp',
    color: '#9AA0A6',
    ring: 'ring-[#9AA0A6]/60',
    chip: 'bg-[#9AA0A6]/20 text-[#4b5563]',
    does: 'Picks up small, well-scoped GitHub issues in its sandbox and opens draft PRs for your review.',
    outcome: 'Small issues become draft PRs while you do real work.',
    connectors: ['GitHub', 'Slack'],
    starter: 'Your job is small repo work. Pick up well-scoped issues labelled good-first-task, reproduce them on our computer, and open draft PRs with tests. Never merge.',
    skill: { name: 'Issue to draft PR', desc: 'Reproduce, fix in workspace, test, open draft PR, never merge.' },
    routine: { name: 'Issue sweep', when: 'weekdays 09:00' },
  },
];

export const jobOptions = finders.map((f) => ({ id: f.id, label: `${f.job} — ${f.name}` }));
