'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { downloadFileUrl, downloadViaApi, isCloudTransport, listFiles, type FileEntry } from '@/lib/agent';
import FileBrowser from './FileBrowser';

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Workspace-root system files: agent memory, guard rules, provider catalog.
 * Hidden from the Library (Settings owns permissions/providers; nothing
 * user-facing should open or download these). Tool-level protection is
 * separate — see computer file tools. */
const SYSTEM_FILES = new Set(['conversations.jsonl', 'permissions.json', 'providers.json']);

export default function TabLibrary() {
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (p: string) => {
    setLoading(true);
    setError('');
    try {
      const out = await listFiles(p);
      setPath(out.path);
      // Hide root-level system files (memory, guard rules, provider
      // catalog). User subfolders are never filtered.
      const entries =
        out.path === ''
          ? out.entries.filter((e) => e.dir || !SYSTEM_FILES.has(e.name))
          : out.entries;
      setEntries(entries);
      setHiddenCount(out.entries.length - entries.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load files');
    } finally {
      setLoading(false);
    }
  }, []);

  // Latest path for the refresh listener without re-subscribing.
  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    void load('');
    const onChange = () => void load(pathRef.current);
    window.addEventListener('wayfind:files-changed', onChange);
    return () => window.removeEventListener('wayfind:files-changed', onChange);
  }, [load]);

  if (loading && entries.length === 0) {
    return (
      <div className="rounded-xl bg-white px-4 py-6 text-center shadow-sm">
        <p className="text-sm font-bold text-navy">Loading files…</p>
      </div>
    );
  }

  if (error && entries.length === 0) {
    return (
      <div className="rounded-xl bg-white px-4 py-6 text-center shadow-sm">
        <p className="text-sm font-bold text-navy">Files unavailable</p>
        <p className="mt-1 text-xs text-heroslate">{error}</p>
        <button onClick={() => void load(path)} className="mt-3 rounded-full bg-ice px-4 py-1.5 text-xs font-bold text-navy">
          Retry
        </button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl bg-white px-4 py-6 text-center shadow-sm">
        <p className="text-sm font-bold text-navy">No saved items yet</p>
        <p className="mt-1 text-xs text-heroslate">Skills and files saved by this Bot will appear here.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm">
      <FileBrowser path={path} entries={entries} onNavigate={(p) => void load(p)}>
        <ul className="divide-y divide-navy/5 border-t border-navy/10">
          {entries
            .filter((e) => !e.dir)
            .map((e) => (
              <li key={e.name} className="flex items-center gap-2.5 px-3 py-2">
                <FileText className="h-4 w-4 shrink-0 text-heroslate" />
                <span className="min-w-0 flex-1" title="To delete this file, just ask your Bot.">
                  <span className="block truncate text-sm font-semibold text-navy">{e.name}</span>
                  <span className="block text-[11px] text-heroslate">
                    {fmtSize(e.size)} · {new Date(e.mtime).toLocaleDateString()}
                  </span>
                </span>
                <a
                  href={downloadFileUrl(path === '' ? e.name : `${path}/${e.name}`)}
                  download
                  aria-label={`Download ${e.name}`}
                  title="Download file"
                  onClick={(ev) => {
                    // Cloud relay needs the Cognito bearer, which <a> cannot
                    // send — fetch as blob instead. Local mode uses the href.
                    if (!isCloudTransport()) return;
                    ev.preventDefault();
                    void downloadViaApi(path === '' ? e.name : `${path}/${e.name}`).catch((err) => {
                      setError(err instanceof Error ? err.message : 'Download failed');
                    });
                  }}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-heroslate hover:bg-ice hover:text-navy"
                >
                  <Download className="h-4 w-4" />
                </a>
              </li>
            ))}
        </ul>
      </FileBrowser>
      {hiddenCount > 0 && (
        <p className="border-t border-navy/5 px-3 py-1.5 text-[11px] text-heroslate" title="Agent memory, guard rules and provider catalog live here but are managed elsewhere.">
          {hiddenCount} system file{hiddenCount === 1 ? '' : 's'} hidden
        </p>
      )}
    </div>
  );
}
