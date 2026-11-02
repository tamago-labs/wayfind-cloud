'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Cloud, KeyRound, Plug, ShieldCheck, Sparkles } from 'lucide-react';
import { backendConfigured } from '@/lib/wayfind-api';
import type { Transport } from '@/lib/transport';
import ComputerTab, { type ComputerInfo } from './ComputerTab';
import {
  getPermissions,
  setPermissions,
  undoPermissions,
  getProviders,
  getSkills,
  removeSkill,
  getMcpServers,
  saveMcpServer,
  patchMcpServer,
  removeMcpServer,
  type PermissionRule,
  type ProvidersState,
  type InstalledSkill,
  type McpServer,
  type McpServerInput,
} from '@/lib/agent';

type Tab = 'computer' | 'permissions' | 'providers' | 'skills' | 'mcp';

const ACTIONS = ['allow', 'ask', 'deny'] as const;

/** Permissions that break basic chat when denied — confirm first. */
const CORE_PERMISSIONS = new Set(['read', 'list', 'task']);

function actionStyle(active: boolean, action: string): string {
  if (!active) return 'text-heroslate hover:text-navy';
  if (action === 'allow') return 'bg-emerald-100 text-emerald-800';
  if (action === 'deny') return 'bg-red-100 text-red-800';
  return 'bg-amber-100 text-amber-800';
}

function PermissionsTab() {
  const [rules, setRules] = useState<PermissionRule[] | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    getPermissions()
      .then(({ rules: r, canUndo: u }) => {
        if (!alive) return;
        setRules(r);
        setCanUndo(u);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load permissions.');
      });
    return () => {
      alive = false;
    };
  }, []);

  // Non-optimistic: local state only changes after the PUT succeeds, so a
  // failed save can never masquerade as applied. Returns true on success.
  const persist = async (next: PermissionRule[]): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const saved = await setPermissions(next);
      setRules(saved);
      setCanUndo(true);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const undo = () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    undoPermissions()
      .then((restored) => {
        if (restored) {
          setRules(restored.rules);
          setCanUndo(restored.canUndo);
        } else {
          setCanUndo(false);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Undo failed.'))
      .finally(() => setSaving(false));
  };

  const setRuleAction = (index: number, action: (typeof ACTIONS)[number]) => {
    if (!rules || saving) return;
    const target = rules[index];
    if (action === 'deny' && CORE_PERMISSIONS.has(target.permission)) {
      const ok = window.confirm(
        `Denying "${target.permission}" will break basic replies. Deny anyway?`,
      );
      if (!ok) return;
    }
    const next = rules.map((r, i) => (i === index ? { ...r, action } : r));
    void persist(next);
  };

  const deleteRule = (index: number) => {
    if (!rules || saving) return;
    const next = rules.filter((_, i) => i !== index);
    void persist(next);
  };

  const revokeAll = (permission: string) => {
    if (!rules || saving) return;
    // Same semantics as the per-row ✕: drop every rule for this permission
    // so its tools fall back to ask (reads stay free by default).
    const next = rules.filter((r) => r.permission !== permission);
    void persist(next);
  };

  if (error && !rules) {
    return <p className="p-5 text-sm font-medium text-red-600">{error}</p>;
  }
  if (!rules) {
    return <p className="p-5 text-sm text-heroslate">Loading permissions…</p>;
  }

  const groups: Array<{ permission: string; items: Array<{ rule: PermissionRule; index: number }> }> = [];
  rules.forEach((rule, index) => {
    const g = groups.find((x) => x.permission === rule.permission);
    if (g) g.items.push({ rule, index });
    else groups.push({ permission: rule.permission, items: [{ rule, index }] });
  });

  return (
    <div className="p-5">
      <p className="text-sm text-heroslate">
        Bots ask before sensitive actions. Allow or deny each one — changes apply to new chats.
      </p>
      {groups.map(({ permission, items }) => (
        <div key={permission} className="mt-5">
          <div className="flex items-center justify-between">
            <h4 className="font-brico text-sm font-bold text-navy">{permission}</h4>
            <button
              onClick={() => revokeAll(permission)}
              disabled={saving}
              aria-label={`Delete all ${permission} rules`}
              title="Delete all rules for this permission"
              className="shrink-0 text-xs font-bold text-heroslate hover:text-red-600 disabled:opacity-50"
            >
              ✕ all
            </button>
          </div>
          <div className="mt-2 space-y-1.5">
            {items.map(({ rule, index }) => (
              <div
                key={index}
                className="flex items-center gap-2 rounded-xl border border-navy/10 bg-ice px-3 py-2"
              >
                <code className="min-w-0 flex-1 truncate text-xs text-navy">{rule.pattern}</code>
                <div className="flex shrink-0 gap-1">
                  {ACTIONS.map((a) => (
                    <button
                      key={a}
                      onClick={() => setRuleAction(index, a)}
                      disabled={saving}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${actionStyle(rule.action === a, a)}`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => deleteRule(index)}
                  disabled={saving}
                  aria-label={`Delete rule ${rule.pattern}`}
                  title="Delete rule"
                  className="shrink-0 text-xs font-bold text-heroslate hover:text-red-600 disabled:opacity-50"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
      {groups.length === 0 && (
        <p className="mt-5 rounded-xl border border-dashed border-navy/20 p-4 text-center text-sm text-heroslate">
          No rules — reads are free, everything else falls back to ask.
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      )}
      <div className="sticky bottom-0 -mx-5 -mb-5 mt-5 border-t border-navy/10 bg-white/95 px-5 py-3 backdrop-blur">
        <div className="flex justify-end">
          <button
            onClick={undo}
            disabled={saving || !canUndo}
            title={canUndo ? 'Restore before the last save' : 'No changes to undo'}
            className="rounded-full border border-navy/15 px-4 py-1.5 text-xs font-bold text-navy hover:border-cta disabled:cursor-not-allowed disabled:opacity-40"
          >
            Undo last change
          </button>
        </div>
      </div>
    </div>
  );
}

function ProvidersTab() {
  const [state, setState] = useState<ProvidersState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getProviders()
      .then((s) => {
        if (alive) setState(s);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load providers.');
      });
    return () => {
      alive = false;
    };
  }, []);

  if (error && !state) {
    return <p className="p-5 text-sm font-medium text-red-600">{error}</p>;
  }
  if (!state) {
    return <p className="p-5 text-sm text-heroslate">Loading providers…</p>;
  }

  return (
    <div className="space-y-4 p-5">
      <p className="text-sm text-heroslate">
        Fixed model per deployment. API access is provided and managed by Wayfind.
      </p>
      {Object.entries(state.providers).map(([pid, p]) => (
        <div key={pid} className="rounded-xl border border-navy/10 bg-ice p-4">
          <div className="flex items-center gap-2">
            <h4 className="font-brico text-sm font-bold text-navy">{pid}</h4>
            <span
              title={p.keyConfigured ? 'API key configured' : 'API key missing — contact support'}
              className={`h-2 w-2 rounded-full ${p.keyConfigured ? 'bg-emerald-500' : 'bg-red-500'}`}
            />
            <span className="text-xs text-heroslate">{p.keyConfigured ? 'connected' : 'not connected'}</span>
          </div>
          <p className="mt-3 text-xs font-bold uppercase tracking-wider text-heroslate">Endpoint</p>
          <code className="mt-1 block break-all text-xs text-navy">{p.baseURL}</code>
          <p className="mt-3 text-xs font-bold uppercase tracking-wider text-heroslate">Model</p>
          <p className="mt-1 text-sm text-navy">
            <code className="text-xs">{state.defaults?.model ?? p.models[0] ?? '—'}</code>{' '}
            <span className="text-[11px] font-bold uppercase tracking-wide text-cta">default</span>
          </p>
        </div>
      ))}
      {error && (
        <p className="text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  computer: ComputerInfo | null;
  computerBusy: boolean;
  computerError: string;
  transport: Transport;
  setTransport: (t: Transport) => void;
  onProvision: () => void;
  onComputerAction: (action: 'suspend' | 'resume' | 'terminate') => void;
}

function SkillsTab() {
  const [skills, setSkills] = useState<InstalledSkill[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getSkills()
      .then((s) => {
        if (alive) setSkills(s);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load skills.');
      });
    return () => {
      alive = false;
    };
  }, []);

  const onRemove = async (name: string) => {
    // Two-click confirm: first click arms, second click removes.
    if (confirming !== name) {
      setConfirming(name);
      return;
    }
    if (busy) return;
    setConfirming(null);
    setBusy(true);
    setError(null);
    try {
      await removeSkill(name);
      setSkills(await getSkills());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed.');
    } finally {
      setBusy(false);
    }
  };

  if (error && !skills) {
    return <p className="p-5 text-sm font-medium text-red-600">{error}</p>;
  }
  if (!skills) {
    return <p className="p-5 text-sm text-heroslate">Loading skills…</p>;
  }

  return (
    <div className="space-y-4 p-5">
      <p className="text-sm text-heroslate">
        All installed skills live here. Add new ones from any bot&apos;s chat:{' '}
        <code className="font-mono text-xs">npx skills add owner/repo</code> or a Github link.
      </p>
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      {skills.length === 0 ? (
        <p className="text-sm text-heroslate">No skills installed yet.</p>
      ) : (
        <ul className="space-y-2">
          {skills.map((s) => (
              <li key={s.name} className="rounded-xl border border-navy/10 bg-ice p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="font-brico text-sm font-bold text-navy" title={s.source}>{s.name}</h4>
                  <p className="mt-0.5 line-clamp-2 text-sm text-heroslate" title={s.description}>
                    {s.description}
                  </p>
                </div>
                <button
                  onClick={() => void onRemove(s.name)}
                  onBlur={() => setConfirming((c) => (c === s.name ? null : c))}
                  disabled={busy}
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold disabled:opacity-50 ${
                    confirming === s.name
                      ? 'border-red-600 bg-red-600 text-white hover:bg-red-700'
                      : 'border-red-200 text-red-600 hover:bg-red-50'
                  }`}
                >
                  {confirming === s.name ? 'Confirm?' : 'Remove'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function McpTab() {
  const [servers, setServers] = useState<McpServer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  // Add form.
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'stdio' | 'remote'>('stdio');
  const [command, setCommand] = useState('');
  const [envText, setEnvText] = useState('');
  const [url, setUrl] = useState('');
  const [headersText, setHeadersText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = async () => {
    setServers(await getMcpServers());
  };

  useEffect(() => {
    let alive = true;
    getMcpServers()
      .then((s) => {
        if (alive) setServers(s);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load MCP servers.');
      });
    return () => {
      alive = false;
    };
  }, []);

  const onToggle = async (s: McpServer) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setServers(await patchMcpServer(s.name, { isActive: !s.isActive }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toggle failed.');
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (srvName: string) => {
    // Two-click confirm: first click arms, second click removes.
    if (confirming !== srvName) {
      setConfirming(srvName);
      return;
    }
    if (busy) return;
    setConfirming(null);
    setBusy(true);
    setError(null);
    try {
      await removeMcpServer(srvName);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed.');
    } finally {
      setBusy(false);
    }
  };

  /** Parse KEY=value lines; returns null + sets formError on bad input. */
  const parsePairs = (text: string, label: string): Record<string, string> | null => {
    const out: Record<string, string> = {};
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      const eq = t.indexOf('=');
      if (eq <= 0) {
        setFormError(`${label}: each line must be KEY=value — bad line: ${t.slice(0, 40)}`);
        return null;
      }
      out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
    return out;
  };

  const onAdd = async () => {
    setFormError(null);
    const cleanName = name.trim();
    if (!cleanName) {
      setFormError('Name is required.');
      return;
    }
    const cfg: McpServerInput = {};
    if (kind === 'stdio') {
      const parts = command.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) {
        setFormError('Command is required for stdio servers, e.g. npx -y @modelcontextprotocol/server-filesystem /data.');
        return;
      }
      cfg.command = parts;
      const env = parsePairs(envText, 'Environment');
      if (!env) return;
      if (Object.keys(env).length > 0) cfg.environment = env;
    } else {
      if (!url.trim()) {
        setFormError('URL is required for remote servers.');
        return;
      }
      cfg.url = url.trim();
      const headers = parsePairs(headersText, 'Headers');
      if (!headers) return;
      if (Object.keys(headers).length > 0) cfg.headers = headers;
    }
    if (busy) return;
    setBusy(true);
    try {
      setServers(await saveMcpServer(cleanName, cfg));
      setAdding(false);
      setName('');
      setCommand('');
      setEnvText('');
      setUrl('');
      setHeadersText('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Add failed.');
    } finally {
      setBusy(false);
    }
  };

  if (error && !servers) {
    return <p className="p-5 text-sm font-medium text-red-600">{error}</p>;
  }
  if (!servers) {
    return <p className="p-5 text-sm text-heroslate">Loading MCP servers…</p>;
  }

  const dot = (s: McpServer) =>
    s.status === 'connected' ? 'bg-emerald-500' : s.status === 'error' ? 'bg-red-500' : 'bg-navy/20';

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-heroslate">
          MCP servers give every bot extra tools. They run globally — each bot can narrow down
          which ones it uses from its own settings. Ask any bot to install one from chat, or add
          one below.
        </p>
        <button
          onClick={() => void refresh()}
          disabled={busy}
          className="shrink-0 rounded-full border border-navy/15 px-3 py-1 text-xs font-bold text-navy hover:bg-ice disabled:opacity-50"
        >
          Refresh
        </button>
      </div>
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      {servers.length === 0 && !adding ? (
        <p className="text-sm text-heroslate">No MCP servers yet.</p>
      ) : (
        <ul className="space-y-2">
          {servers.map((s) => (
            <li key={s.name} className="rounded-xl border border-navy/10 bg-ice p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="flex items-center gap-2 font-brico text-sm font-bold text-navy">
                    <i className={`h-2 w-2 shrink-0 rounded-full ${dot(s)}`} title={s.status} />
                    {s.name}
                    <span className="rounded-full bg-navy/10 px-2 py-0.5 text-[10px] font-bold text-heroslate">
                      {s.type === 'stdio' ? 'local' : 'remote'} · {s.tools} tool{s.tools === 1 ? '' : 's'}
                    </span>
                    {!s.isActive && (
                      <span className="rounded-full bg-navy/10 px-2 py-0.5 text-[10px] font-bold text-heroslate">
                        off
                      </span>
                    )}
                  </h4>
                  {s.configKeys.length > 0 && (
                    <p className="mt-0.5 truncate text-xs text-heroslate" title={s.configKeys.join(', ')}>
                      {s.configKeys.join(', ')}
                    </p>
                  )}
                  {s.status === 'error' && s.lastError && (
                    <p className="mt-0.5 line-clamp-2 text-xs font-medium text-red-600" title={s.lastError}>
                      {s.lastError.slice(0, 200)}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => void onToggle(s)}
                    disabled={busy}
                    className={`rounded-full border px-3 py-1 text-xs font-bold disabled:opacity-50 ${
                      s.isActive
                        ? 'border-navy/15 text-navy hover:bg-white'
                        : 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    {s.isActive ? 'Off' : 'On'}
                  </button>
                  <button
                    onClick={() => void onRemove(s.name)}
                    onBlur={() => setConfirming((c) => (c === s.name ? null : c))}
                    disabled={busy}
                    className={`rounded-full border px-3 py-1 text-xs font-bold disabled:opacity-50 ${
                      confirming === s.name
                        ? 'border-red-600 bg-red-600 text-white hover:bg-red-700'
                        : 'border-red-200 text-red-600 hover:bg-red-50'
                    }`}
                  >
                    {confirming === s.name ? 'Confirm?' : 'Remove'}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <div className="space-y-2.5 rounded-xl border border-navy/10 bg-ice p-3">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (letters, numbers, - _)"
              className="min-w-0 flex-1 rounded-lg border border-navy/15 bg-white px-3 py-1.5 text-sm text-navy outline-none focus:border-cta"
            />
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as 'stdio' | 'remote')}
              className="rounded-lg border border-navy/15 bg-white px-2 py-1.5 text-sm font-semibold text-navy outline-none"
            >
              <option value="stdio">Local</option>
              <option value="remote">Remote</option>
            </select>
          </div>
          {kind === 'stdio' ? (
            <>
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Command, e.g. npx -y @modelcontextprotocol/server-filesystem /data"
                className="w-full rounded-lg border border-navy/15 bg-white px-3 py-1.5 font-mono text-xs text-navy outline-none focus:border-cta"
              />
              <textarea
                value={envText}
                onChange={(e) => setEnvText(e.target.value)}
                placeholder="Environment, one KEY=value per line (optional)"
                rows={2}
                className="w-full rounded-lg border border-navy/15 bg-white px-3 py-1.5 font-mono text-xs text-navy outline-none focus:border-cta"
              />
              <p className="text-xs text-heroslate">
                This runs on your computer with the values above — only add servers you trust.
              </p>
            </>
          ) : (
            <>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Server URL, e.g. https://example.com/mcp"
                className="w-full rounded-lg border border-navy/15 bg-white px-3 py-1.5 font-mono text-xs text-navy outline-none focus:border-cta"
              />
              <textarea
                value={headersText}
                onChange={(e) => setHeadersText(e.target.value)}
                placeholder="Headers, one KEY=value per line (optional)"
                rows={2}
                className="w-full rounded-lg border border-navy/15 bg-white px-3 py-1.5 font-mono text-xs text-navy outline-none focus:border-cta"
              />
            </>
          )}
          {formError && <p className="text-xs font-medium text-red-600">{formError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => void onAdd()}
              disabled={busy}
              className="rounded-full bg-cta px-4 py-1.5 text-xs font-bold text-white hover:bg-ctahover disabled:opacity-50"
            >
              Add server
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setFormError(null);
              }}
              className="rounded-full border border-navy/15 px-4 py-1.5 text-xs font-bold text-navy hover:bg-white"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="rounded-full border-2 border-navy px-4 py-1.5 text-xs font-bold text-navy hover:bg-navy hover:text-white"
        >
          + Add MCP server
        </button>
      )}
    </div>
  );
}

export default function SettingsModal({
  open,
  onClose,
  computer,
  computerBusy,
  computerError,
  transport,
  setTransport,
  onProvision,
  onComputerAction,
}: SettingsModalProps) {
  const showComputer = backendConfigured();
  const [tab, setTab] = useState<Tab>('computer');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Fall back to providers if the computer tab isn't available.
  useEffect(() => {
    if (open && !showComputer) setTab('providers');
    else if (open) setTab('computer');
  }, [open, showComputer]);

  const tabs: Array<{ id: Tab; label: string; icon: typeof ShieldCheck }> = [
    ...(showComputer ? [{ id: 'computer' as Tab, label: 'Computer', icon: Cloud }] : []),
    { id: 'providers', label: 'Providers', icon: KeyRound },
    { id: 'skills', label: 'Skills', icon: Sparkles },
    { id: 'mcp', label: 'MCP', icon: Plug },
    { id: 'permissions', label: 'Permissions', icon: ShieldCheck },
  ];

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
            className="flex max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
          >
            <div className="w-44 shrink-0 border-r border-navy/10 bg-ice p-3">
              <h3 className="px-2 pb-2 font-brico text-base font-bold text-navy">Settings</h3>
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${
                    tab === id ? 'bg-white text-navy shadow-sm' : 'text-heroslate hover:text-navy'
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={2.2} />
                  {label}
                </button>
              ))}
            </div>
            <div className="min-w-0 flex-1 overflow-y-auto">
              {tab === 'computer' && showComputer ? (
                <ComputerTab
                  computer={computer}
                  computerBusy={computerBusy}
                  computerError={computerError}
                  transport={transport}
                  setTransport={setTransport}
                  onProvision={onProvision}
                  onAction={onComputerAction}
                />
              ) : tab === 'providers' ? (
                <ProvidersTab />
              ) : tab === 'skills' ? (
                <SkillsTab />
              ) : tab === 'mcp' ? (
                <McpTab />
              ) : (
                <PermissionsTab />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
