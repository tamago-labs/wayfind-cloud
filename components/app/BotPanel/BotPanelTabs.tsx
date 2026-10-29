'use client';

import { useState } from 'react';
import TabDetails from './TabDetails';
import TabLibrary from './TabLibrary';
import TabComputer from './TabComputer';

const tabs = ['Details', 'Library', 'Computer'] as const;
type Tab = (typeof tabs)[number];

export default function BotPanelTabs({ botId }: { botId: string | null }) {
  const [tab, setTab] = useState<Tab>('Details');

  return (
    <div className="mt-5">
      <div role="tablist" aria-label="Bot panel sections" className="grid grid-cols-3 gap-1 rounded-full bg-white p-1 shadow-sm">
        {tabs.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-full py-1.5 text-xs font-bold transition ${
              tab === t ? 'bg-navy text-white' : 'text-heroslate hover:text-navy'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="mt-3" role="tabpanel">
        {tab === 'Details' && <TabDetails botId={botId} />}
        {tab === 'Library' && <TabLibrary />}
        {tab === 'Computer' && <TabComputer />}
      </div>
    </div>
  );
}
