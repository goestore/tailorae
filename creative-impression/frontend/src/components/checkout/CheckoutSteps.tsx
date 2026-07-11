'use client';

import React from 'react';
import { Card, Button } from '@/components/common';

export interface CheckoutStepsProps {
  steps: Array<{
    id: string;
    name: string;
    label: string;
  }>;
  currentStep: string;
  onStepClick?: (stepId: string) => void;
}

export const CheckoutSteps: React.FC<CheckoutStepsProps> = ({
  steps,
  currentStep,
  onStepClick,
}) => {
  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <Card className="p-6 mb-6">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center">
              <button
                onClick={() => onStepClick?.(step.id)}
                className={`flex items-center justify-center w-10 h-10 rounded-full font-bold mb-2 ${
                  index <= currentStepIndex
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                {index + 1}
              </button>
              <span className="text-xs font-semibold text-gray-700">{step.label}</span>
            </div>

            {index < steps.length - 1 && (
              <div
                className={`flex-1 h-1 mx-4 mb-6 ${
                  index < currentStepIndex ? 'bg-primary-600' : 'bg-gray-200'
                }`}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    </Card>
  );
};
