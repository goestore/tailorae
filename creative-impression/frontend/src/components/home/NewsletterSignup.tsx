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
    <section className="py-12 md:py-16 bg-primary-600 text-white">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold mb-2">{title}</h2>
          <p className="text-primary-100 mb-8">{subtitle}</p>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={placeholder}
              required
              className="flex-1 px-4 py-3 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
            <Button
              type="submit"
              variant="secondary"
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
