'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, Pencil, Receipt, Settings } from 'lucide-react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { fetchUserAttributes, signOut } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import ProfileModal from './ProfileModal';
import SettingsModal from './Settings';
import UsageModal from './UsageModal';
import { newBotColors, newBotShapes } from '../seed';
import { computerAction, provisionComputer } from '@/lib/wayfind-api';
import { VM_ENDPOINT_KEY, TRANSPORT_EVENT, useTransport } from '@/lib/transport';
import { ensureComputerStart, handleComputerGone, refreshComputer, runComputerOp, useComputer } from './useComputer';

const dataClient = generateClient<Schema>();

export default function RosterFooter() {
  const { user } = useAuthenticator();
  const [email, setEmail] = useState('');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  // Shared computer lifecycle (lib acts, AppShell gates): status, boot and
  // ops live in useComputer so the composer/roster can grey out while the
  // VM isn't ready.
  const { computer, busy: computerBusy, error: computerError } = useComputer();
  // Transport toggle: local :8080 vs cloud VM endpoint. Shared via
  // lib/transport.ts so the AppShell banner and request layer agree.
  const [transport, setTransport] = useTransport();
  const [nameOpen, setNameOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchUserAttributes()
      .then((attrs) => {
        if (!alive) return;
        setEmail(attrs?.email ?? user?.signInDetails?.loginId ?? '');
      })
      .catch(() => {
        if (alive) setEmail(user?.signInDetails?.loginId ?? '');
      });
    return () => {
      alive = false;
    };
  }, [user?.userId]);

  // Lazy get-or-create the UserProfile, mirroring the wallet app pattern.
  // NOTE: this effect re-runs when email loads, which can strand a previous
  // run mid-flight. The seed-bot write below is intentionally NOT gated on
  // `alive` (only setState is) — creator-wins: only the run whose create
  // succeeded seeds, so no duplicates.
  useEffect(() => {
    const ownerId = user?.userId;
    if (!ownerId) return;
    let alive = true;
    void (async () => {
      try {
        const { data } = await dataClient.models.UserProfile.profileByOwnerId({ ownerId });
        if (!alive) return;
        if (data && data.length > 0) {
          setProfileId(data[0].id);
          setDisplayName(data[0].displayName ?? '');
        } else {
          const { data: created, errors } = await dataClient.models.UserProfile.create({
            ownerId,
            email,
            plan: 'free',
          });
          if (errors?.length) {
            console.error('[RosterFooter] profile create errors:', errors);
            return;
          }
          if (!created) {
            console.error('[RosterFooter] profile create returned no data');
            return;
          }
          if (alive) setProfileId(created.id);
          // First signup: seed a "Wayfind" chief-of-staff bot so new users
          // land on a ready assistant instead of an empty roster.
          // Best-effort — never blocks profile creation.
          try {
            const { data: existing } = await dataClient.models.Bot.botsByOwnerId({ ownerId });
            if (!existing || existing.length === 0) {
              const { data: seeded, errors: seedErrors } = await dataClient.models.Bot.create({
                ownerId,
                userProfileId: created.id,
                name: 'Wayfind',
                role: 'Chief of staff',
                isChiefOfStaff: true,
                color: newBotColors[0],
                shape: newBotShapes[0],
                status: 'active',
              });
              if (seedErrors?.length || !seeded) {
                console.error('[RosterFooter] seed bot errors:', seedErrors);
                return;
              }
              // Roster may have already fetched an empty list — tell AppShell to refetch.
              window.dispatchEvent(new CustomEvent('wayfind:bots-changed'));
            }
          } catch (err) {
            // seed bot is a nicety; the user can create one manually
            console.error('[RosterFooter] seed bot failed:', err);
          }
        }
      } catch (err) {
        // profile stays unavailable; avatar falls back to email
        console.error('[RosterFooter] profile ensure failed:', err);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.userId, email]);

  // Computer lifecycle: auto-start once per sign-in (new users default to
  // cloud + boot, see useComputer), poll while provisioning, refresh when
  // Settings opens so the Computer tab never shows a stale snapshot.
  useEffect(() => {
    if (!user?.userId) return;
    ensureComputerStart(user.userId);
  }, [user?.userId]);
  useEffect(() => {
    if (computer?.provisionStatus !== 'provisioning') return;
    const t = setInterval(() => void refreshComputer(true), 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computer?.provisionStatus]);
  useEffect(() => {
    if (settingsOpen) void refreshComputer(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen]);
  // Mid-session VM death: lib/agent.ts broadcasts on relay 410s — flip to
  // reconnecting and auto-reprovision (debounced in the handler).
  useEffect(() => {
    const onGone = () => handleComputerGone();
    window.addEventListener('wayfind:computer-gone', onGone);
    return () => window.removeEventListener('wayfind:computer-gone', onGone);
  }, []);
  // Persist the VM endpoint whenever we have one, regardless of toggle
  // position — flipping to cloud before the row loads must not strand chat
  // on localhost (lib/agent.ts throws loudly instead of falling back).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (computer?.endpoint) {
      window.localStorage.setItem(VM_ENDPOINT_KEY, `https://${computer.endpoint}`);
      window.dispatchEvent(new Event(TRANSPORT_EVENT));
    }
  }, [computer?.endpoint]);

  // (runComputerOp lives in useComputer so AppShell/ComputerTab share it)


  const initial = (displayName || email).charAt(0).toUpperCase() || 'P';
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    router.push('/');
  };

  return (
    <div className="relative border-t border-navy/10 p-4" ref={menuRef}>
      <p className="mb-2 flex items-center gap-1.5 text-sm text-heroslate">
        {displayName || 'Enter your name'}
        <button onClick={() => setNameOpen(true)} aria-label="Set profile name" className="hover:text-navy">
          <Pencil className="h-3 w-3" strokeWidth={2} />
        </button>
      </p>
      <div className="flex items-center gap-2.5">
        <span className="relative shrink-0">
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                role="menu"
                aria-label="Profile menu"
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-full left-0 mb-1 w-52 overflow-hidden rounded-2xl border border-navy/10 bg-white py-1.5 shadow-xl shadow-navy/10"
              >
                <div className="flex items-center gap-2.5 px-4 pb-2 pt-1.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ice font-bold text-navy">
                    {initial}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-navy">
                      {displayName || email || 'Your profile'}
                    </span>
                    {displayName && email ? (
                      <span className="block truncate text-xs text-heroslate">{email}</span>
                    ) : null}
                  </span>
                </div>
                <div className="mx-4 my-1 border-t border-navy/10" aria-hidden="true" />
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setSettingsOpen(true);
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-navy hover:bg-ice"
                >
                  <Settings className="h-4 w-4" strokeWidth={2.2} />
                  Settings
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setUsageOpen(true);
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-navy hover:bg-ice"
                >
                  <Receipt className="h-4 w-4" strokeWidth={2.2} />
                  Usage
                </button>
                <div className="mx-4 my-1 border-t border-navy/10" aria-hidden="true" />
                <button
                  role="menuitem"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-navy hover:bg-ice"
                >
                  <LogOut className="h-4 w-4" strokeWidth={2.2} />
                  Sign out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Profile menu"
            title={email || 'Profile menu'}
            className="grid h-10 w-10 place-items-center rounded-full bg-white font-bold text-navy shadow-sm hover:bg-slate-50"
          >
            {initial}
          </button>
        </span>
        <button className="flex flex-1 items-center justify-center gap-2.5 rounded-full bg-white py-2.5 font-semibold text-navy shadow-sm hover:bg-slate-50">
          Connectors
          <span className="flex -space-x-1" aria-hidden="true">
            <i className="grid h-5 w-5 place-items-center rounded bg-[#EA4335] text-[10px] font-bold not-italic text-white ring-2 ring-white">M</i>
            <i className="grid h-5 w-5 place-items-center rounded bg-navy text-[10px] font-bold not-italic text-white ring-2 ring-white">N</i>
            <i className="grid h-5 w-5 place-items-center rounded bg-blagoon text-[10px] font-bold not-italic text-white ring-2 ring-white">D</i>
          </span>
          </button>
        </div>
      <ProfileModal
        open={nameOpen}
        onClose={() => setNameOpen(false)}
        profileId={profileId}
        initialName={displayName}
        onSaved={setDisplayName}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        computer={computer}
        computerBusy={computerBusy}
        computerError={computerError}
        transport={transport}
        setTransport={setTransport}
        onProvision={() => void runComputerOp(provisionComputer)}
        onComputerAction={(action) => void runComputerOp(() => computerAction(action))}
      />
      <UsageModal open={usageOpen} onClose={() => setUsageOpen(false)} ownerId={user?.userId ?? null} />
    </div>
  );
}
