'use client';

import React, { useState } from 'react';

/**
 * Split out of Footer so the footer itself can render on the server. This is the
 * only interactive part of it, and the footer sits on every page.
 */
export const NewsletterForm: React.FC = () => {
  const [email, setEmail] = useState('');

  return (
    <form
      className="sm:flex"
      onSubmit={(e) => {
        e.preventDefault();
        // No signup endpoint exists yet; clear the field rather than faking a
        // loading state the user would read as a successful subscription.
        setEmail('');
      }}
    >
      <input
        type="email"
        placeholder="Enter your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full py-2 sm:max-w-xs"
        suppressHydrationWarning
        required
      />
      <button type="submit" className="btn btn-primary mt-3 w-full sm:ml-3 sm:mt-0 sm:w-auto">
        Subscribe
      </button>
    </form>
  );
};
