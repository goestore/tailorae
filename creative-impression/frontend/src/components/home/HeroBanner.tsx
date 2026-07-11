'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/common';

export interface HeroBannerProps {
  title?: string;
  subtitle?: string;
  backgroundImage?: string;
  ctaText?: string;
  ctaLink?: string;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  title = 'Premium Custom Printing Solutions',
  subtitle = 'Create impressive designs with our creative printing services',
  backgroundImage = '/images/hero-banner.jpg',
  ctaText = 'Explore Products',
  ctaLink = '/products',
}) => {
  return (
    <section
      className="relative min-h-96 bg-cover bg-center"
      style={{ backgroundImage: `url('${backgroundImage}')` }}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Content */}
      <div className="relative flex items-center justify-center min-h-96">
        <div className="text-center text-white px-4 max-w-2xl">
          <h1 className="text-4xl md:text-6xl font-bold mb-4">{title}</h1>
          <p className="text-lg md:text-xl mb-8 text-gray-100">{subtitle}</p>
          <Link href={ctaLink}>
            <Button variant="primary" size="lg">
              {ctaText}
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
};
