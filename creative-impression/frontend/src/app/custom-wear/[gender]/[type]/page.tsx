import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCategoryByRoute, getCategoryGroup } from '@/config/custom-wear/taxonomy';
import {
  allCategoryParams,
  buildCollectionMetadata,
  renderCollectionPage,
} from '@/lib/custom-wear/collection-page';

interface PageProps {
  params: Promise<{ gender: string; type: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export function generateStaticParams() {
  return allCategoryParams;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { gender, type } = await params;
  const category = getCategoryByRoute(gender, type);
  if (!category) return { title: 'Custom Wear | Creative Impression' };
  return buildCollectionMetadata(category, getCategoryGroup(gender));
}

export default async function CustomWearCategoryPage({ params, searchParams }: PageProps) {
  const { gender, type } = await params;
  const category = getCategoryByRoute(gender, type);

  if (!category) notFound();

  return renderCollectionPage({
    searchParams: await searchParams,
    category,
    group: getCategoryGroup(gender),
  });
}
