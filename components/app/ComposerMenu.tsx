'use client';

import { useRef, useState } from 'react';
import { Sparkles, Paperclip, Plug } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import FolderPickerModal from './FolderPickerModal';

interface ComposerMenuProps {
  open: boolean;
  onClose: () => void;
  botName: string;
  onSelectSkills: () => void;
  onSelectMcp: () => void;
}

/** Action menu anchored to the composer's + button: skills + MCP + file upload. */
export default function ComposerMenu({ open, onClose, botName, onSelectSkills, onSelectMcp }: ComposerMenuProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File[] | null>(null);

  const onFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setPending(Array.from(files));
    if (fileRef.current) fileRef.current.value = '';
    onClose();
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.12 }}
              className="absolute bottom-14 left-0 z-50 w-64 overflow-hidden rounded-2xl border border-navy/10 bg-white p-1.5 shadow-xl"
              role="menu"
              aria-label="Composer actions"
            >
              <button
                onClick={() => {
                  onSelectSkills();
                  onClose();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-ice"
                role="menuitem"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-cta/10 text-cta">
                  <Sparkles className="h-4 w-4" strokeWidth={2.2} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-navy">Skills</span>
                  <span className="block truncate text-xs text-heroslate">Enable or disable for {botName}</span>
                </span>
              </button>
              <button
                onClick={() => {
                  onSelectMcp();
                  onClose();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-ice"
                role="menuitem"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-cta/10 text-cta">
                  <Plug className="h-4 w-4" strokeWidth={2.2} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-navy">MCP servers</span>
                  <span className="block truncate text-xs text-heroslate">Choose tools for {botName}</span>
                </span>
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-ice"
                role="menuitem"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-bmoss/15 text-[#4c7a3f]">
                  <Paperclip className="h-4 w-4" strokeWidth={2.2} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-navy">Add files</span>
                  <span className="block truncate text-xs text-heroslate">Upload to the shared computer</span>
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
                onChange={(e) => onFiles(e.target.files)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {pending && (
        <FolderPickerModal
          files={pending}
          onClose={() => setPending(null)}
          onDone={() => {
            setPending(null);
            window.dispatchEvent(new CustomEvent('wayfind:files-changed'));
          }}
        />
      )}
    </>
  );
}
