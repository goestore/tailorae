/**
 * Analytics abstraction.
 *
 * No provider is configured yet, so events go to a queue (and to the console
 * in development). Wire a provider by calling `setCustomWearAnalyticsSink`
 * once at app start — every existing call site keeps working.
 */

import type { AnalyticsPayload, CustomWearAnalyticsEvent } from '@/types/custom-wear';

export interface AnalyticsRecord {
  event: CustomWearAnalyticsEvent;
  payload: AnalyticsPayload;
  timestamp: number;
}

type AnalyticsSink = (record: AnalyticsRecord) => void;

const MAX_BUFFERED_EVENTS = 100;
const buffer: AnalyticsRecord[] = [];
let sink: AnalyticsSink | null = null;

const isEnabled = (): boolean => process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true';

/** Registers the real provider and flushes anything captured before it loaded. */
export function setCustomWearAnalyticsSink(next: AnalyticsSink): void {
  sink = next;
  while (buffer.length > 0) {
    const record = buffer.shift();
    if (record) next(record);
  }
}

export function trackCustomWearEvent(
  event: CustomWearAnalyticsEvent,
  payload: AnalyticsPayload = {}
): void {
  const record: AnalyticsRecord = { event, payload, timestamp: Date.now() };

  if (sink) {
    sink(record);
    return;
  }

  if (buffer.length >= MAX_BUFFERED_EVENTS) buffer.shift();
  buffer.push(record);

  if (process.env.NODE_ENV === 'development' && isEnabled()) {
    console.debug('[custom-wear analytics]', event, payload);
  }
}

/** Exposed for debugging and for tests. */
export function getBufferedAnalyticsEvents(): AnalyticsRecord[] {
  return [...buffer];
}
