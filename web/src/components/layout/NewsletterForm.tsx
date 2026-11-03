'use client';

import React, { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-utils';

/**
 * Split out of Footer so the footer itself can render on the server. This is the
 * only interactive part of it, and the footer sits on every page.
 *
 * It used to clear the field and do nothing, because there was no endpoint —
 * `POST /api/newsletter` now records the address, and re-subscribing an
 * existing one succeeds quietly rather than reporting who is already on the
 * list.
 */
export const NewsletterForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const subscribe = async (event: React.FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(address)) {
      setError('Enter a valid email address.');
      return;
    }

    setStatus('saving');
    setError(null);
    try {
      await apiClient.post('/newsletter', { email: address, source: 'footer' });
      setStatus('done');
      setEmail('');
    } catch (err) {
      setStatus('idle');
      setError(getApiErrorMessage(err, 'Could not sign you up right now.'));
    }
  };

  if (status === 'done') {
    return (
      <p className="m-0 text-sm font-medium text-ink" role="status">
        Thanks — you are on the list.
      </p>
    );
  }

  return (
    <form className="sm:flex sm:items-start" onSubmit={subscribe}>
      <div className="w-full sm:max-w-xs">
        <label htmlFor="newsletter-email" className="sr-only">
          Email address
        </label>
        <input
          id="newsletter-email"
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError(null);
          }}
          // Same height as the button beside it.
          className="h-[42px] w-full"
          suppressHydrationWarning
          required
        />
        {error && (
          <p className="mt-1 text-xs" style={{ color: 'var(--sale)' }}>
            {error}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={status === 'saving'}
        className="btn btn-primary mt-3 h-[42px] w-full sm:ml-3 sm:mt-0 sm:w-auto"
      >
        {status === 'saving' ? 'Signing up…' : 'Subscribe'}
      </button>
    </form>
  );
};
