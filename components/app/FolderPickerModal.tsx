'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Download, FileText, Loader2, X } from 'lucide-react';
import { listFiles, uploadFile, type FileEntry } from '@/lib/agent';
import FileBrowser from './BotPanel/FileBrowser';

interface FolderPickerModalProps {
  files: File[];
  onClose: () => void;
  onDone: () => void;
}

type Status = 'queued' | 'uploading' | 'done' | 'error';

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? '');
      resolve(s.includes(',') ? s.split(',')[1] : s);
    };
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

export default function FolderPickerModal({ files, onClose, onDone }: FolderPickerModalProps) {
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [newFolder, setNewFolder] = useState('');
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<'pick' | 'uploading' | 'done'>('pick');

  const load = useCallback(async (p: string) => {
    try {
      const out = await listFiles(p);
      setPath(out.path);
      setEntries(out.entries);
    } catch {
      // Treat unknown dirs as empty (upload will create them).
      setPath(p);
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    void load('');
  }, [load]);

  // Success beat before closing so the user sees the result.
  useEffect(() => {
    if (phase !== 'done') return;
    const t = setTimeout(onDone, 1200);
    return () => clearTimeout(t);
  }, [phase, onDone]);

  const createFolder = () => {
    const name = newFolder.trim().replace(/[/\\]/g, '');
    if (!name) return;
    setNewFolder('');
    void load(path === '' ? name : `${path}/${name}`);
  };

  const upload = async () => {
    if (phase === 'uploading') return;
    setPhase('uploading');
    let ok = true;
    for (const f of files) {
      setStatus((s) => ({ ...s, [f.name]: 'uploading' }));
      try {
        const b64 = await readAsBase64(f);
        await uploadFile(path === '' ? f.name : `${path}/${f.name}`, b64);
        setStatus((s) => ({ ...s, [f.name]: 'done' }));
      } catch (err) {
        ok = false;
        setStatus((s) => ({ ...s, [f.name]: 'error' }));
        setErrors((e) => ({ ...e, [f.name]: err instanceof Error ? err.message : 'Upload failed' }));
      }
    }
    setPhase(ok ? 'done' : 'pick');
  };

  const where = path === '' ? '/workspace/' : `/workspace/${path}/`;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy/40 p-4" role="dialog" aria-modal="true" aria-label="Choose upload folder">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-navy/10 px-4 py-3">
          <p className="text-sm font-bold text-navy">Upload {files.length} file{files.length === 1 ? '' : 's'} to {where}</p>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-heroslate hover:bg-ice">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-64 overflow-y-auto">
          <FileBrowser path={path} entries={entries} onNavigate={(p) => void load(p)} />
          <div className="flex items-center gap-2 px-3 py-2">
            <input
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createFolder();
              }}
              placeholder="New folder name"
              className="min-w-0 flex-1 rounded-lg border border-navy/10 bg-ice px-2.5 py-1.5 text-xs text-navy outline-none placeholder:text-slate-400 focus:border-cta"
            />
            <button
              onClick={createFolder}
              className="shrink-0 rounded-full bg-ice px-3 py-1.5 text-xs font-bold text-navy hover:bg-navy hover:text-white"
            >
              + New folder
            </button>
          </div>
        </div>

        <ul className="max-h-32 divide-y divide-navy/5 overflow-y-auto border-t border-navy/10">
          {files.map((f) => {
            const st = status[f.name] ?? 'queued';
            return (
              <li key={f.name} className="flex items-center gap-2 px-4 py-1.5 text-xs">
                {st === 'done' ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-blagoon" />
                ) : st === 'uploading' ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-cta" />
                ) : (
                  <FileText className="h-3.5 w-3.5 shrink-0 text-heroslate" />
                )}
                <span className="min-w-0 flex-1 truncate font-semibold text-navy">{f.name}</span>
                {st === 'error' ? (
                  <span className="shrink-0 font-semibold text-red-600">{errors[f.name] ?? 'Failed'}</span>
                ) : st === 'done' ? (
                  <span className="shrink-0 font-semibold text-[#12706f]">Uploaded</span>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="border-t border-navy/10 p-3">
          {phase === 'done' ? (
            <p className="rounded-full bg-blagoon/15 py-2.5 text-center text-sm font-bold text-[#12706f]">
              Uploaded {files.length} file{files.length === 1 ? '' : 's'} to {where}
            </p>
          ) : (
            <button
              onClick={() => void upload()}
              disabled={phase === 'uploading'}
              className="w-full rounded-full bg-cta py-2.5 text-sm font-bold text-white hover:bg-ctahover disabled:opacity-60"
            >
              {phase === 'uploading' ? 'Uploading…' : `Upload to ${where}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
