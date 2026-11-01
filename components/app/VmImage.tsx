'use client';

import { useEffect, useRef, useState } from 'react';
import { cloudEndpoint, downloadFileUrl, isCloudTransport, transportAuthHeaders, viewFileUrl } from '@/lib/agent';

/** The image tool bakes an absolute server-local URL into its markdown
 * (`http://127.0.0.1:8080/files/view?path=…`) — correct on the VM, dead in
 * the browser (nothing listens on the user's loopback in cloud mode, and it
 * bypasses the relay). The runner also appends transport-relative
 * `/files/view?path=…` links. Rewrite both to the active transport's file
 * URL so they load everywhere. */
export function normalizeSrc(src: string): string {
  let u: URL;
  try {
    // Dummy base keeps relative agent paths parseable; only /files/ paths
    // are ever rewritten, so app routes and text are untouched.
    u = new URL(src, 'http://placeholder.invalid');
  } catch {
    return src;
  }
  const p = u.searchParams.get('path');
  if (!p || (!u.pathname.startsWith('/files/view') && !u.pathname.startsWith('/files/download'))) return src;
  if (u.host !== 'placeholder.invalid') {
    const vmHost = (() => {
      try {
        const ep = cloudEndpoint();
        return ep ? new URL(ep).hostname : '';
      } catch {
        return '';
      }
    })();
    const isAgentHost =
      u.hostname === '127.0.0.1' || u.hostname === 'localhost' || (vmHost !== '' && u.hostname === vmHost);
    if (!isAgentHost) return src;
  }
  if (u.pathname.startsWith('/files/view')) return viewFileUrl(p);
  return downloadFileUrl(p);
}

/** Image that works on both transports. Local mode uses the plain URL (no
 * auth needed, no CORS issue for <img>). Cloud mode needs the bearer, which
 * <img> cannot send — so fetch as blob and render an object URL, keeping
 * the previous image visible while a new src loads (stale-while-revalidate:
 * progressive streams change src per chunk, and blanking each time
 * flashes). Starts blank in cloud so a 401 never paints first. */
export default function VmImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const normalized = normalizeSrc(src);
  const cloud = isCloudTransport();
  const [url, setUrl] = useState<string | null>(cloud ? null : normalized);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const objectUrlRef = useRef<string | null>(null);
  useEffect(() => {
    setFailed(false);
    if (!cloud) {
      setUrl(normalized);
      return;
    }
    if (!/^https?:\/\//.test(normalized)) {
      setUrl(normalized);
      return;
    }
    let alive = true;
    // Debounce: chunks arrive ~1/s while streaming; fetch once quiet.
    const t = setTimeout(
      () =>
        void (async () => {
          try {
            const headers = await transportAuthHeaders();
            if (!alive) return;
            const res = await fetch(normalized, { headers });
            if (!res.ok || !alive) throw new Error(`image ${res.status}`);
            const objectUrl = URL.createObjectURL(await res.blob());
            if (!alive) {
              URL.revokeObjectURL(objectUrl);
              return;
            }
            if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = objectUrl;
            setUrl(objectUrl);
          } catch {
            if (alive) setFailed(true);
          }
        })(),
      600,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [normalized, cloud, retry]);
  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={alt} loading="lazy" className={className} />;
  }
  if (failed) {
    return (
      <button
        type="button"
        onClick={() => setRetry((r) => r + 1)}
        title="Image failed to load — retry"
        className={`grid min-h-24 place-items-center rounded-xl bg-slate-100 px-4 py-6 text-xs font-semibold text-heroslate hover:bg-slate-200 ${className ?? ''}`}
      >
        Image failed to load — tap to retry
      </button>
    );
  }
  return <span role="img" aria-label={alt} className={`block min-h-24 animate-pulse rounded-xl bg-slate-100 ${className ?? ''}`} />;
}
