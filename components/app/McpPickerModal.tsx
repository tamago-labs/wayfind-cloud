'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Plug } from 'lucide-react';
import { getMcpServers, type McpServer } from '@/lib/agent';

interface McpPickerModalProps {
  open: boolean;
  onClose: () => void;
  botName: string;
  /** Null = all active servers enabled. */
  enabled: string[] | null;
  onSave: (enabled: string[] | null) => void;
}

/** Per-bot MCP picker: uncheck to hide a server's tools from this bot. */
export default function McpPickerModal({ open, onClose, botName, enabled, onSave }: McpPickerModalProps) {
  const [servers, setServers] = useState<McpServer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setError(null);
    getMcpServers()
      .then((s) => {
        if (!alive) return;
        setServers(s);
        // Null (all enabled) checks everything; a saved list checks its names.
        setSelected(new Set(enabled ?? s.map((k) => k.name)));
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load MCP servers.');
      });
    return () => {
      alive = false;
    };
  }, [open, enabled]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const save = () => {
    if (!servers) return;
    // All checked = "all enabled" (null) so future installs join automatically.
    onSave(selected.size === servers.length ? null : Array.from(selected));
    onClose();
  };

  const dot = (s: McpServer) =>
    !s.isActive
      ? 'bg-navy/20'
      : s.status === 'connected'
        ? 'bg-emerald-500'
        : s.status === 'error'
          ? 'bg-red-500'
          : 'bg-navy/20';

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.97, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.97, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`MCP servers for ${botName}`}
          >
            <div className="flex items-center gap-2">
              <Plug className="h-4 w-4 text-cta" strokeWidth={2.2} />
              <h3 className="font-brico text-base font-bold text-navy">MCP servers for {botName}</h3>
            </div>
            <p className="mt-1 text-sm text-heroslate">
              Unchecked servers are hidden from this bot. New installs join automatically unless you
              uncheck them here. Servers turned off under Settings → MCP stay off for everyone.
            </p>
            {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
            {!servers && !error && <p className="mt-3 text-sm text-heroslate">Loading servers…</p>}
            {servers && servers.length === 0 && (
              <p className="mt-3 text-sm text-heroslate">
                No MCP servers yet — ask any bot to install one from chat, or add one under Settings → MCP.
              </p>
            )}
            {servers && servers.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {servers.map((s) => (
                  <li key={s.name}>
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-navy/10 bg-ice px-3 py-2.5 hover:border-cta/40">
                      <input
                        type="checkbox"
                        checked={selected.has(s.name)}
                        onChange={() => toggle(s.name)}
                        className="mt-1 h-4 w-4 shrink-0 accent-[#2F7BFF]"
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 font-brico text-sm font-bold text-navy">
                          <i className={`h-2 w-2 shrink-0 rounded-full ${dot(s)}`} />
                          {s.name}
                          {!s.isActive && (
                            <span className="rounded-full bg-navy/10 px-1.5 py-px text-[10px] font-bold text-heroslate">
                              off
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-heroslate">
                          {s.type === 'stdio' ? 'local' : 'remote'} · {s.tools} tool{s.tools === 1 ? '' : 's'}
                          {s.status === 'error' && s.lastError ? ` · ${s.lastError.slice(0, 80)}` : ''}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-full border border-navy/15 px-4 py-1.5 text-xs font-bold text-navy hover:bg-ice"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={!servers}
                className="rounded-full bg-cta px-4 py-1.5 text-xs font-bold text-white hover:bg-ctahover disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
