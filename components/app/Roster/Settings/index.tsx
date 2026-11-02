'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Cloud, Plug, ShieldCheck, Sparkles } from 'lucide-react';
import { backendConfigured } from '@/lib/wayfind-api';
import type { Transport } from '@/lib/transport';
import ComputerTab, { type ComputerInfo } from '../ComputerTab';
import PermissionsTab from './tabs/PermissionsTab';
import SkillsTab from './tabs/SkillsTab';
import McpTab from './tabs/McpTab';

type Tab = 'computer' | 'permissions' | 'skills' | 'mcp';

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
    if (open && !showComputer) setTab('skills');
    else if (open) setTab('computer');
  }, [open, showComputer]);

  const tabs: Array<{ id: Tab; label: string; icon: typeof ShieldCheck }> = [
    ...(showComputer ? [{ id: 'computer' as Tab, label: 'Computer', icon: Cloud }] : []),
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
