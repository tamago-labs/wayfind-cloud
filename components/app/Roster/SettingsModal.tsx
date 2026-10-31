'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { KeyRound, ShieldCheck, Sparkles } from 'lucide-react';
import {
  getPermissions,
  setPermissions,
  undoPermissions,
  getProviders,
  getSkills,
  removeSkill,
  type PermissionRule,
  type ProvidersState,
  type InstalledSkill,
} from '@/lib/agent';

type Tab = 'permissions' | 'providers' | 'skills';

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

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [tab, setTab] = useState<Tab>('providers');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const tabs: Array<{ id: Tab; label: string; icon: typeof ShieldCheck }> = [
    { id: 'providers', label: 'Providers', icon: KeyRound },
    { id: 'skills', label: 'Skills', icon: Sparkles },
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
              {tab === 'providers' ? <ProvidersTab /> : tab === 'skills' ? <SkillsTab /> : <PermissionsTab />}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
