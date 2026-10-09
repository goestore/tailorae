'use client';

import React, { useId, useState } from 'react';

/**
 * Small, dependency-free SVG charts for the admin, in the Shopify-analytics
 * idiom: recessive grid, faint axis labels, one strong series colour, and a
 * hover tooltip that names the exact value. Every chart has a text
 * alternative (aria-label) so the figure is never colour-only.
 */

export const CHART_COLORS = [
  '#005bd3',
  '#29845a',
  '#b28400',
  '#d55181',
  '#7a6fd8',
  '#d95926',
  '#0094d5',
  '#8a8a8a',
];

export type Formatter = (value: number) => string;

export const formatINR: Formatter = (value) => `₹${Math.round(value || 0).toLocaleString('en-IN')}`;
export const formatCount: Formatter = (value) => Math.round(value || 0).toLocaleString('en-IN');
export const formatCompactINR: Formatter = (value) => {
  const v = Math.abs(value);
  if (v >= 1e7) return `₹${(value / 1e7).toFixed(1)}Cr`;
  if (v >= 1e5) return `₹${(value / 1e5).toFixed(1)}L`;
  if (v >= 1e3) return `₹${(value / 1e3).toFixed(1)}k`;
  return `₹${Math.round(value)}`;
};

const niceMax = (max: number): number => {
  if (max <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / exp;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * exp;
};

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/* ── Change pill ───────────────────────────────────────────────────── */

export function Delta({
  value,
  inverse = false,
}: {
  value: number | null | undefined;
  inverse?: boolean;
}) {
  if (value === null || value === undefined) {
    return <span className="ch-delta ch-delta--flat">—</span>;
  }
  const up = value > 0;
  const good = inverse ? !up : up;
  const flat = value === 0;
  return (
    <span
      className={`ch-delta ${flat ? 'ch-delta--flat' : good ? 'ch-delta--good' : 'ch-delta--bad'}`}
      aria-label={`${up ? 'Up' : flat ? 'No change' : 'Down'} ${Math.abs(value)}% on the previous period`}
    >
      {flat ? '' : up ? '↑' : '↓'} {Math.abs(value).toFixed(Math.abs(value) < 10 ? 1 : 0)}%
    </span>
  );
}

/* ── Sparkline ─────────────────────────────────────────────────────── */

export function Sparkline({
  values,
  color = CHART_COLORS[0],
  width = 120,
  height = 36,
  fluid = false,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
  /** Stretch to the container's width; the line keeps its thickness. */
  fluid?: boolean;
}) {
  const id = `sp${useId().replace(/:/g, '')}`;
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * width,
    height - 3 - (v / max) * (height - 6),
  ]);
  const line = pts.map((p) => p.join(',')).join(' ');
  return (
    <svg
      width={fluid ? '100%' : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={fluid ? 'none' : undefined}
      aria-hidden="true"
      className="ch-spark"
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${line} ${width},${height}`} fill={`url(#${id})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* ── Time series: area or bars, with hover ──────────────────────────── */

export function TimeSeriesChart({
  data,
  valueKey,
  compareKey,
  kind = 'area',
  format = formatCount,
  axisFormat,
  height = 260,
  color = CHART_COLORS[0],
  label,
}: {
  data: Array<Record<string, number | string>>;
  valueKey: string;
  /** A second, dashed series (e.g. paid revenue under gross sales). */
  compareKey?: string;
  kind?: 'area' | 'bar';
  format?: Formatter;
  axisFormat?: Formatter;
  height?: number;
  color?: string;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 760;
  const H = height;
  const pad = { top: 16, right: 12, bottom: 28, left: 56 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const values = data.map((d) => Number(d[valueKey]) || 0);
  const compare = compareKey ? data.map((d) => Number(d[compareKey]) || 0) : [];
  const max = niceMax(Math.max(...values, ...compare, 0));
  const n = data.length;
  const step = innerW / Math.max(n, 1);
  const x = (i: number) =>
    kind === 'bar'
      ? pad.left + step * i + step / 2
      : pad.left + (n < 2 ? 0 : (i / (n - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const labelEvery = Math.max(1, Math.ceil(n / 8));
  const fmtAxis = axisFormat ?? format;
  const id = `ts${useId().replace(/:/g, '')}`;
  const line = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const total = values.reduce((s, v) => s + v, 0);

  return (
    <div className="ch-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="ch-svg"
        role="img"
        aria-label={`${label}: ${format(total)} over ${n} days, highest day ${format(Math.max(...values, 0))}`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} className="ch-grid" />
            <text x={pad.left - 10} y={y(t) + 4} textAnchor="end" className="ch-axis">
              {fmtAxis(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text key={String(d.date)} x={x(i)} y={H - 8} textAnchor="middle" className="ch-axis">
              {shortDate(String(d.date))}
            </text>
          ) : null
        )}

        {kind === 'area' ? (
          <>
            <polygon points={`${x(0)},${y(0)} ${line} ${x(n - 1)},${y(0)}`} fill={`url(#${id})`} />
            {compareKey && (
              <polyline
                points={compare.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
                fill="none"
                stroke="#8a8a8a"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
            )}
            <polyline
              points={line}
              fill="none"
              stroke={color}
              strokeWidth="2.25"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        ) : (
          values.map((v, i) => {
            const bw = Math.max(2, Math.min(28, step * 0.62));
            return (
              <rect
                key={i}
                x={x(i) - bw / 2}
                y={y(v)}
                width={bw}
                height={Math.max(0, y(0) - y(v))}
                rx={Math.min(4, bw / 3)}
                fill={color}
                opacity={hover === null || hover === i ? 1 : 0.45}
              />
            );
          })
        )}

        {/* Hover targets: one column per day. */}
        {data.map((_, i) => (
          <rect
            key={i}
            x={x(i) - step / 2}
            y={pad.top}
            width={step}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={y(0)} className="ch-guide" />
            {kind === 'area' && (
              <circle
                cx={x(hover)}
                cy={y(values[hover])}
                r="4"
                fill="#fff"
                stroke={color}
                strokeWidth="2"
              />
            )}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div
          className="ch-tip"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            transform: `translateX(${x(hover) / W > 0.7 ? '-105%' : '8px'})`,
          }}
        >
          <div className="ch-tip-date">{shortDate(String(data[hover].date))}</div>
          <div className="ch-tip-row">
            <span className="ch-swatch" style={{ background: color }} />
            {label}
            <strong>{format(values[hover])}</strong>
          </div>
          {compareKey && (
            <div className="ch-tip-row">
              <span className="ch-swatch" style={{ background: '#8a8a8a' }} />
              Paid
              <strong>{format(compare[hover])}</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Donut ─────────────────────────────────────────────────────────── */

export function Donut({
  data,
  format = formatCount,
  centerLabel,
  size = 168,
}: {
  data: Array<{ label: string; value: number; color?: string }>;
  format?: Formatter;
  centerLabel: string;
  size?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const shown = hover !== null ? data[hover] : null;
  return (
    <div className="ch-donut">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${centerLabel}: ${data.map((d) => `${d.label} ${format(d.value)}`).join(', ')}`}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ebebeb" strokeWidth="16" />
        {total > 0 &&
          data.map((d, i) => {
            const len = (d.value / total) * c;
            const seg = (
              <circle
                key={d.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={d.color ?? CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={hover === i ? 20 : 16}
                strokeDasharray={`${Math.max(len - 2, 0.01)} ${c}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ transition: 'stroke-width 120ms' }}
              />
            );
            offset += len;
            return seg;
          })}
        <text x="50%" y="47%" textAnchor="middle" className="ch-donut-value">
          {shown ? format(shown.value) : format(total)}
        </text>
        <text x="50%" y="60%" textAnchor="middle" className="ch-donut-label">
          {shown ? shown.label : centerLabel}
        </text>
      </svg>
      <ul className="ch-legend">
        {data.map((d, i) => (
          <li key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span
              className="ch-swatch"
              style={{ background: d.color ?? CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span className="ch-legend-label">{d.label}</span>
            <span className="ch-legend-value">{format(d.value)}</span>
            <span className="ch-legend-pct">
              {total ? Math.round((d.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Horizontal bars ───────────────────────────────────────────────── */

export function BarList({
  rows,
  format = formatINR,
  color = CHART_COLORS[0],
  empty = 'No data in this period',
}: {
  rows: Array<{ label: string; value: number; sub?: string }>;
  format?: Formatter;
  color?: string;
  empty?: string;
}) {
  if (!rows.length) return <p className="ch-empty">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="ch-barlist">
      {rows.map((row, index) => (
        <li key={`${row.label}-${index}`}>
          <div className="ch-barlist-head">
            <span className="ch-barlist-label" title={row.label}>
              {row.label}
              {row.sub && <span className="ch-barlist-sub"> · {row.sub}</span>}
            </span>
            <span className="ch-barlist-value">{format(row.value)}</span>
          </div>
          <div className="ch-barlist-track">
            <div
              className="ch-barlist-fill"
              style={{ width: `${Math.max((row.value / max) * 100, 2)}%`, background: color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
