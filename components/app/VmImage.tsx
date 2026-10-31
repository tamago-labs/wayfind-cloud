'use client';

import { useEffect, useState } from 'react';
import { vmAuthHeaders } from '@/lib/agent';

/** Image that works on both transports. Absolute URLs stay plain <img> in
 * local mode; in cloud mode the VM proxy needs the auth header, which
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
  const [url, setUrl] = useState(src);
  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    setUrl(src);
    if (!/^https?:\/\//.test(src)) return;
    void (async () => {
      try {
        const headers = await vmAuthHeaders();
        if (!alive || Object.keys(headers).length === 0) return;
        const res = await fetch(src, { headers });
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
  }, [src]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} loading="lazy" className={className} />;
}
