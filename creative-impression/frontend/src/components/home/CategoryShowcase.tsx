'use client';

import React from 'react';
import Link from 'next/link';
import { Card } from '@/components/common';

export interface CategoryShowcaseProps {
  categories?: Array<{
    id: string;
    name: string;
    image: string;
    link: string;
  }>;
}

export const CategoryShowcase: React.FC<CategoryShowcaseProps> = ({
  categories = [
    {
      id: '1',
      name: 'Business Cards',
      image: '/images/business-cards.jpg',
      link: '/products/business-cards',
    },
    {
      id: '2',
      name: 'T-Shirts',
      image: '/images/t-shirts.jpg',
      link: '/products/t-shirts',
    },
    {
      id: '3',
      name: 'Flyers & Posters',
      image: '/images/flyers-posters.jpg',
      link: '/products/flyers-posters',
    },
    {
      id: '4',
      name: 'Custom Printing',
      image: '/images/custom-printing.jpg',
      link: '/customization',
    },
  ],
}) => {
  return (
    <section className="py-12 md:py-16 lg:py-20 bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">Popular Categories</h2>
        <p className="text-center text-gray-600 mb-12">Explore our wide range of printing products</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {categories.map((category) => (
            <Link key={category.id} href={category.link}>
              <Card className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer">
                <div
                  className="h-48 bg-cover bg-center"
                  style={{ backgroundImage: `url('${category.image}')` }}
                />
                <div className="p-4">
                  <h3 className="font-semibold text-lg">{category.name}</h3>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};
