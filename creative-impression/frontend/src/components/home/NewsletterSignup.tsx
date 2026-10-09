'use client';

import React, { useState } from 'react';
import { Button } from '@/components/common';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';

export interface NewsletterSignupProps {
  title?: string;
  subtitle?: string;
  placeholder?: string;
  buttonText?: string;
  /** Overrides the default signup call — used where the section is a preview. */
  onSubmit?: (email: string) => void;
}

export const NewsletterSignup: React.FC<NewsletterSignupProps> = ({
  title = 'Subscribe to Our Newsletter',
  subtitle = 'Get exclusive offers and updates delivered to your inbox',
  placeholder = 'Enter your email',
  buttonText = 'Subscribe',
  onSubmit,
}) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!address) return;

    setIsLoading(true);
    setError(null);
    try {
      if (onSubmit) {
        onSubmit(address);
      } else {
        await apiClient.post('/newsletter', { email: address, source: 'homepage' });
      }
      setIsDone(true);
      setEmail('');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not sign you up right now.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="py-8 md:py-10 bg-white border-t border-line">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="mb-2 text-ink">{title}</h2>
          <p className="mb-8 text-ink-3">{subtitle}</p>

          {isDone ? (
            <p className="m-0 font-medium text-ink" role="status">
              Thanks — you are on the list.
            </p>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  placeholder={placeholder}
                  required
                  className="flex-1 px-4 py-3"
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  disabled={isLoading}
                >
                  {isLoading ? 'Subscribing...' : buttonText}
                </Button>
              </form>
              {error && (
                <p className="mt-2 text-sm" style={{ color: 'var(--sale)' }}>
                  {error}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
};
