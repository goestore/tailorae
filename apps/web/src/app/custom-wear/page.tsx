import type { Metadata } from 'next';
import { buildCollectionMetadata, renderCollectionPage } from '@/lib/custom-wear/collection-page';

export const metadata: Metadata = buildCollectionMetadata();

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CustomWearPage({ searchParams }: PageProps) {
  return renderCollectionPage({ searchParams: await searchParams });
}
