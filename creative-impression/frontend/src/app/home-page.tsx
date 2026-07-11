'use client';

import React from 'react';
import { HeroBanner, CategoryShowcase, FeaturedProducts, NewsletterSignup } from '@/components/home';

export default function HomePage() {
  return (
    <main>
      <HeroBanner 
        title="Premium Custom Printing Solutions"
        subtitle="Create impressive designs with our creative printing services"
      />
      <CategoryShowcase />
      <FeaturedProducts />
      <NewsletterSignup />
    </main>
  );
}
