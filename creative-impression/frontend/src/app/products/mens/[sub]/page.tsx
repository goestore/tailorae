import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CategoryListing } from '@/components/product/CategoryListing';
import { findChild, findSection } from '@/config/catalog';

const PARENT = 'mens';

interface Params { params: Promise<{ sub: string }> }

export function generateStaticParams() {
  return (findSection(PARENT)?.children ?? []).map((c) => ({ sub: c.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { sub } = await params;
  const section = findChild(PARENT, sub);
  if (!section) return {};
  return {
    title: `${section.title} | Creative Impression`,
    description: section.description,
  };
}

export default async function Page({ params }: Params) {
  const { sub } = await params;
  const parent = findSection(PARENT);
  const section = findChild(PARENT, sub);
  if (!parent || !section) notFound();
  return <CategoryListing section={section} parent={parent} />;
}
