'use client';

import React from 'react';
import { Card } from '@/components/common';

export interface CheckoutStepsProps {
  steps: Array<{
    id: string;
    name: string;
    label: string;
  }>;
  currentStep: string;
  onStepClick?: (stepId: string) => void;
}

/**
 * The three-step checkout ladder.
 *
 * Each step is an equal `flex-1` column and the connector is drawn as an
 * absolutely positioned rule behind the markers rather than as a flex sibling
 * with fixed side margins — a fixed margin is what made the row wider than a
 * 320px phone once the labels were in place. Nothing here has an intrinsic
 * width, so the ladder shrinks with the viewport instead of overflowing it.
 */
export const CheckoutSteps: React.FC<CheckoutStepsProps> = ({
  steps,
  currentStep,
  onStepClick,
}) => {
  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <Card className="mb-6 p-4">
      <ol className="m-0 flex list-none items-start p-0">
        {steps.map((step, index) => {
          const reached = index <= currentStepIndex;
          // Only a step already left behind is navigable; the page enforces the
          // same rule, and a dead-looking button is kinder than one that does
          // nothing when pressed.
          const isNavigable = index < currentStepIndex;

          return (
            <li
              key={step.id}
              className="relative flex min-w-0 flex-1 flex-col items-center"
              aria-current={index === currentStepIndex ? 'step' : undefined}
            >
              {index > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute right-1/2 top-[13px] h-px w-full"
                  style={{ background: reached ? 'var(--brand)' : 'var(--border)' }}
                />
              )}
              <button
                type="button"
                disabled={!isNavigable}
                onClick={() => onStepClick?.(step.id)}
                // The number alone is not a name. The label below repeats the
                // step, so it is hidden from assistive tech and the button
                // carries the wording instead of both being announced.
                aria-label={isNavigable ? `Back to ${step.name}` : step.name}
                className="relative z-10 flex h-[27px] w-[27px] items-center justify-center rounded-full text-[12px] transition-colors disabled:cursor-default"
                style={{
                  background: reached ? 'var(--brand)' : 'var(--surface)',
                  border: `1px solid ${reached ? 'var(--brand)' : 'var(--border-strong)'}`,
                  color: reached ? 'var(--ink)' : 'var(--ink-3)',
                }}
              >
                {index + 1}
              </button>
              <span
                aria-hidden="true"
                className="mt-2 text-center text-[10px] font-bold uppercase tracking-[0.08em]"
                style={{ color: reached ? 'var(--ink)' : 'var(--ink-3)' }}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
};
