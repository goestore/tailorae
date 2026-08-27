import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CategoryListing } from '@/components/product/CategoryListing';
import { findSection } from '@/config/catalog';

const SLUG = 'womens';

export async function generateMetadata(): Promise<Metadata> {
  const section = findSection(SLUG);
  if (!section) return {};
  return {
    title: `${section.title} | Creative Impression`,
    description: section.description,
  };
}

export default function Page() {
  const section = findSection(SLUG);
  if (!section) notFound();
  return <CategoryListing section={section} />;
}
