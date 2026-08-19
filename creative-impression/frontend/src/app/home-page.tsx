'use client';

import React from 'react';
import { HeroBanner, CategoryCarousel, FeaturedProducts, NewsletterSignup } from '@/components/home';

export default function HomePage() {
  return (
    <main>
      <HeroBanner 
        title="Premium Custom Printing Solutions"
        subtitle="Create impressive designs with our creative printing services"
      />
      <CategoryCarousel />
      <FeaturedProducts />
      <NewsletterSignup />
    </main>
  );
}
