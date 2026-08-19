import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CUSTOM_WEAR_CATEGORY_GROUPS, getCategoryGroup } from '@/config/custom-wear/taxonomy';
import { buildCollectionMetadata, renderCollectionPage } from '@/lib/custom-wear/collection-page';

interface PageProps {
  params: Promise<{ gender: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export function generateStaticParams() {
  return CUSTOM_WEAR_CATEGORY_GROUPS.map((group) => ({ gender: group.genderSlug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { gender } = await params;
  const group = getCategoryGroup(gender);
  if (!group) return { title: 'Custom Wear | Creative Impression' };
  return buildCollectionMetadata(undefined, group);
}

export default async function CustomWearGenderPage({ params, searchParams }: PageProps) {
  const { gender } = await params;
  const group = getCategoryGroup(gender);

  // Anything that is not men/women/kids is a 404, not an empty listing.
  if (!group) notFound();

  return renderCollectionPage({ searchParams: await searchParams, group });
}
