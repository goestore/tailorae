import type { Metadata } from 'next';
import { DepartmentListing, departmentMetadata } from '@/components/product/DepartmentListing';

const DEPT = 'womens';

export function generateMetadata(): Promise<Metadata> {
  return departmentMetadata(DEPT);
}

export default function Page() {
  return <DepartmentListing dept={DEPT} />;
}
