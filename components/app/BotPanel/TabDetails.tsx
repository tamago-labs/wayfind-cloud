'use client';

export default function TabDetails({ botId }: { botId: string | null }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between rounded-xl bg-white px-4 py-2.5 shadow-sm">
        <span className="font-semibold text-heroslate">Status</span>
        <span className="font-bold text-navy">Active</span>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-white px-4 py-2.5 shadow-sm">
        <span className="font-semibold text-heroslate">Bot ID</span>
        <span className="max-w-[10rem] truncate font-mono text-xs text-navy">{botId ?? 'Not synced yet'}</span>
      </div>
      <p className="px-1 pt-1 text-xs text-heroslate">More details (model, memory usage) land here next.</p>
    </div>
  );
}
