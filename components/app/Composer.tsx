'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Mic, Plus, Paperclip, X, FileText, Loader2 } from 'lucide-react';
import ComposerMenu from './ComposerMenu';
import VoiceModal from './VoiceModal';
import VmImage from './VmImage';
import { uploadFile, viewFileUrl } from '@/lib/agent';

interface ComposerProps {
  botName: string;
  draft: string;
  onDraft: (v: string) => void;
  onSend: (attachments: string[]) => void;
  onVoiceSend: (text: string) => void;
  onOpenSkills: () => void;
  onOpenMcp: () => void;
  /** Cognito sub for usage attribution. */
  ownerId?: string;
  /** Other bots for @mentions (chief thread only). Empty = no autocomplete. */
  mentionNames?: string[];
  /** Grey out while the cloud computer isn't ready. */
  disabled?: boolean;
  /** Status line shown above the box when disabled (e.g. "Booting your computer…"). */
  disabledHint?: string;
  /** Retry the computer start (shown when disabled and provided). */
  onRetry?: () => void;
  /** Fall back to local transport (shown when disabled and provided). */
  onGoLocal?: () => void;
}

/** Trailing @mention being typed, e.g. "@Re" in "ask @Re". Null when none. */
function mentionQuery(draft: string): string | null {
  const m = draft.match(/(?:^|\s)@([A-Za-z0-9_-]{0,24})$/);
  return m ? m[1] : null;
}

export default function Composer({ botName, draft, onDraft, onSend, onVoiceSend, onOpenSkills, onOpenMcp, ownerId, mentionNames = [], disabled = false, disabledHint, onRetry, onGoLocal }: ComposerProps) {
  const [plusOpen, setPlusOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  // Staged attachments: uploaded to the workspace immediately (they live
  // in Library under attachments/), sent to the bot on Send.
  const [staged, setStaged] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const [attachError, setAttachError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const isImagePath = (p: string): boolean => /\.(png|jpe?g|gif|webp)$/i.test(p);

  const send = () => {
    if (uploading > 0) return;
    onSend(staged);
    setStaged([]);
    setAttachError('');
  };

  const attach = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setAttachError('');
    const picked = Array.from(files).slice(0, 5 - staged.length);
    for (const f of picked) {
      const okType = f.type.startsWith('image/') || f.type === 'application/pdf';
      if (!okType) {
        setAttachError(`${f.name}: only images and PDFs can be attached.`);
        continue;
      }
      if (f.size > 10 * 1024 * 1024) {
        setAttachError(`${f.name}: over the 10MB attach limit.`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const b64 = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => {
            const s = String(r.result ?? '');
            resolve(s.includes(',') ? s.split(',')[1] : s);
          };
          r.onerror = () => reject(new Error('read failed'));
          r.readAsDataURL(f);
        });
        const safe = f.name.replace(/[/\\]/g, '');
        const path = `attachments/${Date.now()}-${safe}`;
        await uploadFile(path, b64);
        setStaged((s) => [...s, path]);
      } catch (err) {
        setAttachError(`${f.name}: ${err instanceof Error ? err.message : 'upload failed'}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const q = mentionQuery(draft);
  const mentions =
    q === null || mentionNames.length === 0
      ? []
      : mentionNames.filter((n) => n.toLowerCase().startsWith(q.toLowerCase())).slice(0, 5);

  const pickMention = (name: string) => {
    onDraft(draft.replace(/@([A-Za-z0-9_-]{0,24})$/, `@${name} `));
  };

  useEffect(() => {
    if (!plusOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlusOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [plusOpen]);

  return (
    <div className="px-4 pb-4">
      <div className="relative mx-auto max-w-2xl">
        {mentions.length > 0 && (
          <div className="absolute bottom-full left-4 right-4 z-10 mb-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            {mentions.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => pickMention(n)}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-semibold text-navy hover:bg-cta/5"
              >
                <span className="text-cta">@</span>
                {n}
              </button>
            ))}
          </div>
        )}
        {(staged.length > 0 || attachError) && (
          <div className="mb-1 flex flex-wrap items-center gap-2 px-2">
            {staged.map((p) => (
              <span key={p} className="group relative inline-flex items-center gap-1.5 rounded-xl border border-navy/15 bg-ice py-1 pl-1 pr-2">
                {isImagePath(p) ? (
                  <VmImage src={viewFileUrl(p)} alt={p} className="h-10 w-10 rounded-lg object-cover" />
                ) : (
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-white">
                    <FileText className="h-5 w-5 text-heroslate" />
                  </span>
                )}
                <span className="max-w-32 truncate text-xs font-semibold text-navy" title={p}>
                  {p.split('/').pop()}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${p}`}
                  onClick={() => setStaged((s) => s.filter((x) => x !== p))}
                  className="grid h-5 w-5 place-items-center rounded-full bg-white/80 text-heroslate hover:text-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {attachError && <span className="text-xs font-semibold text-red-600">{attachError}</span>}
          </div>
        )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled) send();
        }}
        aria-disabled={disabled}
        className={`relative mx-auto flex max-w-2xl items-center gap-2 rounded-full border border-slate-200 bg-white p-1.5 shadow-sm focus-within:border-cta ${disabled ? 'opacity-60' : ''}`}
      >
        {disabled && disabledHint && (
          <span className="absolute -top-9 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-navy px-4 py-1.5 text-xs font-bold text-white shadow-lg" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {disabledHint}
            {onRetry && (
              <button type="button" onClick={onRetry} className="underline hover:text-slate-200">
                Retry
              </button>
            )}
          </span>
        )}
        <ComposerMenu
          open={plusOpen}
          onClose={() => setPlusOpen(false)}
          botName={botName}
          onSelectSkills={onOpenSkills}
          onSelectMcp={onOpenMcp}
        />
        <button
          type="button"
          aria-label="Composer actions"
          aria-expanded={plusOpen}
          onClick={() => setPlusOpen((o) => !o)}
          disabled={disabled}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-heroslate hover:bg-slate-200 disabled:opacity-50"
        >
          <Plus className="h-[18px] w-[18px]" strokeWidth={2.2} />
        </button>
        <input
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && mentions.length > 0) {
              e.preventDefault();
              pickMention(mentions[0]);
            }
          }}
          autoComplete="off"
          placeholder={staged.length > 0 ? `Message ${botName} about ${staged.length} file${staged.length === 1 ? '' : 's'}` : `Message ${botName}`}
          className="min-w-0 flex-1 bg-transparent px-1 text-[15px] text-navy outline-none placeholder:text-slate-400"
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf"
          multiple
          className="hidden"
          aria-label="Attach images or PDF"
          onChange={(e) => void attach(e.target.files)}
        />
        <button
          type="button"
          aria-label="Attach images or PDF"
          title="Attach images or PDF (saved to Library, shown to the Bot)"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-heroslate hover:bg-slate-200 disabled:opacity-50"
        >
          {uploading > 0 ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Paperclip className="h-[18px] w-[18px]" strokeWidth={2.2} />}
        </button>
        <button
          type="button"
          aria-label="Voice message"
          onClick={() => setVoiceOpen(true)}
          disabled={disabled}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-heroslate hover:bg-slate-200 disabled:opacity-50"
        >
          <Mic className="h-[18px] w-[18px]" strokeWidth={2.2} />
        </button>
        <button
          type="submit"
          aria-label="Send"
          disabled={disabled}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cta text-white hover:bg-ctahover disabled:opacity-50"
        >
          <Send className="h-[18px] w-[18px]" strokeWidth={2.4} />
        </button>
      </form>
      </div>
      {voiceOpen && (
        <VoiceModal onVoiceSend={onVoiceSend} onClose={() => setVoiceOpen(false)} ownerId={ownerId} />
      )}
      <p className="mx-auto mt-2 max-w-2xl text-center text-xs text-slate-400">
        Early access is free with limited usage. We&apos;ll let you know when paid plans arrive.
      </p>
    </div>
  );
}
