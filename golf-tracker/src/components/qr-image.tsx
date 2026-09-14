'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

// F-058: QR codes are generated ON DEVICE. The old api.qrserver.com <img> sent
// the share link — token included — to a third party on every render, and drew
// nothing on cart-path wifi. A data: URL does neither.
export function QrImage({ data, alt, size = 180, className }: {
  data: string;
  alt: string;
  size?: number;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(data, { width: size * 2, margin: 1 })
      .then((url) => { if (!cancelled) setSrc(url); })
      .catch(() => { if (!cancelled) setSrc(null); });
    return () => { cancelled = true; };
  }, [data, size]);

  if (!src) {
    // Placeholder keeps the modal from jumping while the code renders.
    return <div style={{ width: size, height: size }} className={className} aria-hidden />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={size} height={size} className={className} />;
}
