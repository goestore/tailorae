'use client';

import { useEffect, useRef, useState } from 'react';

type Device = 'desktop' | 'tablet' | 'phone';
type FrameState = 'loading' | 'ready' | 'failed';

const DEVICES: Array<{ id: Device; label: string; detail: string }> = [
  { id: 'desktop', label: 'Desktop', detail: 'Full width' },
  { id: 'tablet', label: 'Tablet', detail: '768 px' },
  { id: 'phone', label: 'Phone', detail: '390 px' },
];

/** How long the frame may take before it is treated as unreachable. */
const LOAD_TIMEOUT_MS = 20000;

export default function StorefrontPreviewPage() {
  const [device, setDevice] = useState<Device>('desktop');
  const [refreshKey, setRefreshKey] = useState(0);
  const [frameState, setFrameState] = useState<FrameState>('loading');
  const frameRef = useRef<HTMLIFrameElement>(null);
  /**
   * A root-relative src resolves against the page the iframe is on, so the
   * storefront loads without reading `window.location` — which the server
   * cannot do, and which forced the frame to start on `about:blank` and swap
   * after paint.
   */
  const previewSrc = '/';

  /**
   * `load` fires for the browser's own error page too, so success is checked
   * by reading the frame's location: the storefront is same-origin and
   * readable, while a refused or failed frame is an opaque error document
   * whose location throws. Returns null while the frame is still blank.
   */
  const inspectFrame = (): FrameState | null => {
    try {
      const view = frameRef.current?.contentWindow;
      const href = view?.location.href;
      if (!href || href === 'about:blank') return null;
      return view?.document.readyState === 'complete' ? 'ready' : null;
    } catch {
      return 'failed';
    }
  };

  const handleLoad = () => setFrameState(inspectFrame() ?? 'failed');

  useEffect(() => {
    // The server-rendered frame can finish loading before hydration attaches
    // `onLoad`, so look once now; and a frame that never loads (server down,
    // request hanging) is shown as failed rather than as an endless blank.
    const early = inspectFrame();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (early) setFrameState(early);
    const timer = window.setTimeout(() => {
      setFrameState((current) => (current === 'loading' ? (inspectFrame() ?? 'failed') : current));
    }, LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [refreshKey]);

  const refresh = () => {
    setFrameState('loading');
    setRefreshKey((key) => key + 1);
  };

  const active = DEVICES.find((option) => option.id === device) ?? DEVICES[0];

  return (
    <div className="admin-content">
      <header className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Responsive preview</h1>
          <p className="admin-page-sub">Review the live customer experience before you share it.</p>
        </div>
        <div className="admin-page-actions">
          <a className="btn" href={previewSrc} target="_blank" rel="noreferrer">
            Open storefront
          </a>
          <button type="button" className="btn" onClick={refresh}>
            Refresh preview
          </button>
        </div>
      </header>

      <div className="admin-preview-toolbar">
        <div className="admin-device-picker" role="group" aria-label="Preview device">
          {DEVICES.map((option) => (
            <button
              key={option.id}
              type="button"
              className={device === option.id ? 'is-active' : ''}
              onClick={() => setDevice(option.id)}
              aria-pressed={device === option.id}
              title={`${option.label} · ${option.detail}`}
            >
              {option.label}
              <small>{option.detail}</small>
            </button>
          ))}
        </div>
        <span className="admin-preview-meta" aria-live="polite">
          {frameState === 'loading' ? 'Loading storefront…' : `${active.label} · ${active.detail}`}
        </span>
      </div>

      <section
        className={`admin-preview-stage admin-preview-stage--${device}`}
        aria-label={`${device} storefront preview`}
      >
        <div className="admin-preview-chrome">
          <span></span>
          <span></span>
          <span></span>
          <p>creativeimpression.in</p>
        </div>
        <div className="admin-preview-frame">
          <iframe
            key={refreshKey}
            ref={frameRef}
            title="Storefront preview"
            src={previewSrc}
            onLoad={handleLoad}
            onError={() => setFrameState('failed')}
          />
          {frameState === 'failed' && (
            <div className="admin-empty" role="alert">
              <div className="admin-empty-icon" aria-hidden="true">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M3 9h18M9 14l6 0" />
                </svg>
              </div>
              <p className="admin-empty-title">The storefront could not be shown here</p>
              <p className="admin-empty-text">
                It may be offline or refusing to load inside a frame. You can still review it in its
                own tab.
              </p>
              <div className="admin-page-actions justify-center">
                <a className="btn btn-primary" href={previewSrc} target="_blank" rel="noreferrer">
                  Open storefront in a new tab
                </a>
                <button type="button" className="btn" onClick={refresh}>
                  Try again
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
      <p className="admin-preview-note">
        This preview shows the current published storefront. Save and publish content changes, then
        refresh this frame to review the result.
      </p>
    </div>
  );
}
