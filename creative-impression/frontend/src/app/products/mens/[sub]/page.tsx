import type { Metadata } from 'next';
import { DepartmentListing, departmentMetadata } from '@/components/product/DepartmentListing';
import { fetchCategoryTree, flattenStoreTree, storeHref } from '@/lib/category-tree';

const DEPT = 'mens';

interface Params { params: Promise<{ sub: string }> }

/** Every subcategory under the department, at its storefront URL. */
export async function generateStaticParams() {
  const dept = (await fetchCategoryTree())?.find((c) => c.slug === DEPT);
  if (!dept) return [];
  return flattenStoreTree(dept.children).map((c) => ({ sub: storeHref(c).split('/').pop()! }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { sub } = await params;
  return departmentMetadata(DEPT, sub);
}

export default async function Page({ params }: Params) {
  const { sub } = await params;
  return <DepartmentListing dept={DEPT} sub={sub} />;
}
