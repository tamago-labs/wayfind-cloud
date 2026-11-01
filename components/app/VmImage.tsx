'use client';

import { useEffect, useState } from 'react';
import { cloudEndpoint, downloadFileUrl, transportAuthHeaders, viewFileUrl } from '@/lib/agent';

/** The image tool bakes an absolute server-local URL into its markdown
 * (`http://127.0.0.1:8080/files/view?path=…`) — correct on the VM, dead in
 * the browser (nothing listens on the user's loopback in cloud mode, and it
 * bypasses the relay). Rewrite loopback/VM-host file URLs to the active
 * transport's file URL so they load everywhere. */
export function normalizeSrc(src: string): string {
  let u: URL;
  try {
    u = new URL(src);
  } catch {
    return src;
  }
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
  const p = u.searchParams.get('path');
  if (!p) return src;
  if (u.pathname.endsWith('/files/view')) return viewFileUrl(p);
  if (u.pathname.endsWith('/files/download')) return downloadFileUrl(p);
  return src;
}

/** Image that works on both transports. Absolute URLs stay plain <img> in
 * local mode; in cloud mode the relay needs the auth header, which
 * <img> cannot send — so fetch as blob and render an object URL. */
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
  const [url, setUrl] = useState(normalized);
  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    setUrl(normalized);
    if (!/^https?:\/\//.test(normalized)) return;
    void (async () => {
      try {
        const headers = await transportAuthHeaders();
        if (!alive || Object.keys(headers).length === 0) return;
        const res = await fetch(normalized, { headers });
        if (!res.ok || !alive) return;
        objectUrl = URL.createObjectURL(await res.blob());
        if (alive) setUrl(objectUrl);
      } catch {
        // Fall back to the plain src (local mode / public URL).
      }
    })();
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [normalized]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} loading="lazy" className={className} />;
}
