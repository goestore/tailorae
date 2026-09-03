'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Device = 'desktop' | 'tablet' | 'phone';

const DEVICES: Array<{ id: Device; label: string; detail: string }> = [
  { id: 'desktop', label: 'Desktop', detail: 'Full width' },
  { id: 'tablet', label: 'Tablet', detail: '768 px' },
  { id: 'phone', label: 'Phone', detail: '390 px' },
];

export default function StorefrontPreviewPage() {
  const [device, setDevice] = useState<Device>('desktop');
  const [refreshKey, setRefreshKey] = useState(0);
  const [previewSrc, setPreviewSrc] = useState('about:blank');

  useEffect(() => {
    setPreviewSrc(`${window.location.origin}/`);
  }, []);

  return (
    <div className="admin-content admin-preview-page">
      <header className="admin-page-header admin-preview-header">
        <Link href="/admin">Admin</Link>
        <div>
          <p className="admin-kicker">Storefront quality</p>
          <h1>Responsive preview</h1>
          <span>Review the live customer experience before you share it.</span>
        </div>
      </header>

      <div className="admin-preview-toolbar" aria-label="Preview controls">
        <div className="admin-device-picker" role="group" aria-label="Preview device">
          {DEVICES.map((option) => (
            <button
              key={option.id}
              type="button"
              className={device === option.id ? 'is-active' : ''}
              onClick={() => setDevice(option.id)}
              aria-pressed={device === option.id}
            >
              <span>{option.label}</span><small>{option.detail}</small>
            </button>
          ))}
        </div>
        <button type="button" className="admin-refresh-preview" onClick={() => setRefreshKey((key) => key + 1)}>Refresh preview <span aria-hidden="true">↻</span></button>
      </div>

      <section className={`admin-preview-stage admin-preview-stage--${device}`} aria-label={`${device} storefront preview`}>
        <div className="admin-preview-chrome"><span></span><span></span><span></span><p>creativeimpression.in</p></div>
        <iframe key={refreshKey} title="Storefront preview" src={previewSrc} />
      </section>
      <p className="admin-preview-note">This preview shows the current published storefront. Save and publish content changes, then refresh this frame to review the result.</p>
    </div>
  );
}
