'use client';

import React, { useState } from 'react';
import { Button } from '@/components/common';

export interface NewsletterSignupProps {
  title?: string;
  subtitle?: string;
  placeholder?: string;
  buttonText?: string;
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setIsLoading(true);
      try {
        onSubmit?.(email);
      } finally {
        setIsLoading(false);
        setEmail('');
      }
    }
  };

  return (
    <section className="py-8 md:py-10 bg-white border-t border-line">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="mb-2 text-ink">{title}</h2>
          <p className="mb-8 text-ink-3">{subtitle}</p>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
        </div>
      </div>
    </section>
  );
};
