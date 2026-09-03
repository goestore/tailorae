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
      className="hero-premium relative overflow-hidden bg-cover bg-center"
      style={{ backgroundImage: `url('${backgroundImage}')` }}
    >
      <div className="absolute inset-0 bg-black/65" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_30%,rgba(251,182,2,0.22),transparent_28%)]" />

      {/* Content */}
      <div className="relative mx-auto flex min-h-[460px] max-w-7xl items-end px-5 py-12 sm:px-8 md:min-h-[560px] md:items-center lg:px-12">
        <div className="max-w-2xl text-white">
          <p className="mb-4 text-xs uppercase tracking-[0.18em] text-[var(--brand)]">Creative Impression</p>
          <h1 className="mb-5 text-4xl leading-[1.05] md:text-6xl">{title}</h1>
          <p className="mb-8 max-w-xl text-base leading-relaxed text-white/80 md:text-lg">{subtitle}</p>
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
