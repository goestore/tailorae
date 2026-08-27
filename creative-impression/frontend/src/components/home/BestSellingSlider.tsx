'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ViewAllTile } from '@/components/product';
import { ScrollRail } from '@/components/common';

export interface BestSellingProduct {
  id: string;
  name: string;
  image: string;
  link: string;
  mrp?: string;
  sellingPrice?: string;
  discount?: string;
}

export interface BestSellingSliderProps {
  products?: BestSellingProduct[];
  title?: string;
}

const DEFAULT_PRODUCTS: BestSellingProduct[] = [
  {
    id: '1',
    name: 'Premium Polo T-Shirt',
    image: '/images/Women Polo T-Shirt.webp',
    link: '/products/womens/polo-t-shirt',
    mrp: '₹799',
    sellingPrice: '₹499',
    discount: '38%',
  },
  {
    id: '2',
    name: 'Classic Round Neck',
    image: '/images/Mens Polo T-Shirt.webp',
    link: '/products/mens/round-neck-tshirts',
    mrp: '₹599',
    sellingPrice: '₹399',
    discount: '33%',
  },
  {
    id: '3',
    name: 'Formal Men Shirt',
    image: '/images/Mens Shirt.webp',
    link: '/products/mens/shirts',
    mrp: '₹1,299',
    sellingPrice: '₹899',
    discount: '31%',
  },
  {
    id: '4',
    name: 'Trendy Women Top',
    image: '/images/Women Top.webp',
    link: '/products/womens/tops-tunics',
    mrp: '₹899',
    sellingPrice: '₹599',
    discount: '33%',
  },
  {
    id: '5',
    name: 'Kids Polo T-Shirt',
    image: '/images/Boys Polo T-Shirts.webp',
    link: '/products/kids/boys-polo-tshirt',
    mrp: '₹499',
    sellingPrice: '₹349',
    discount: '30%',
  },
  {
    id: '6',
    name: 'Custom Print Tee',
    image: '/images/Round Neck T-Shirt.webp',
    link: '/custom-printing',
    mrp: '₹699',
    sellingPrice: '₹449',
    discount: '36%',
  },
  {
    id: '7',
    name: 'Winter Sweatshirt',
    image: '/images/WINTER.webp',
    link: '/products/mens/round-neck-tshirts',
    mrp: '₹1,499',
    sellingPrice: '₹999',
    discount: '33%',
  },
  {
    id: '8',
    name: 'Plus Size Top',
    image: '/images/Female Model.webp',
    link: '/products/womens/plus-size',
    mrp: '₹1,099',
    sellingPrice: '₹749',
    discount: '32%',
  },
  {
    id: '9',
    name: 'Corporate Uniform Set',
    image: '/images/Male Model.webp',
    link: '/b2b',
    mrp: '₹1,899',
    sellingPrice: '₹1,299',
    discount: '32%',
  },
];

export const BestSellingSlider: React.FC<BestSellingSliderProps> = ({
  products = DEFAULT_PRODUCTS,
  title = 'BEST SELLING',
}) => {
  const [missingImages, setMissingImages] = useState<Set<string>>(new Set());
  const getInitials = (name: string) =>
    name
      .split(/[\s'-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase();

  const handleImageError = (id: string) => {
    setMissingImages((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  return (
    <section className="bg-white">
      <div className="container-max">
        <h2 className="heading-rule mb-4 md:mb-5">{title}</h2>

        <ScrollRail label="best selling">
          {products.map((product) => {
            const isMissing = missingImages.has(product.id);

            return (
              <Link
                key={product.id}
                href={product.link}
                className="pcard pcard-fixed group snap-start no-underline"
              >
                <div className="pcard-media">
                  {isMissing ? (
                    <div className="flex h-full w-full items-center justify-center text-base font-semibold text-ink-3">
                      {getInitials(product.name)}
                    </div>
                  ) : (
                    <Image
                      src={product.image}
                      alt={product.name}
                      width={320}
                      height={420}
                      sizes="(max-width: 640px) 60vw, 240px"
                      className="h-full w-full object-cover"
                      onError={() => handleImageError(product.id)}
                    />
                  )}
                </div>

                {/* The reserved title height keeps price rows aligned across the row. */}
                <div className="pcard-body">
                  <h3 className="line-clamp-2 text-[13px] font-normal leading-[1.3] text-ink">
                    {product.name}
                  </h3>
                  <div className="mt-0.5 flex flex-wrap items-baseline gap-1.5">
                    {product.sellingPrice && (
                      <span className="text-[13px] font-semibold text-ink">
                        {product.sellingPrice}
                      </span>
                    )}
                    {product.mrp && (
                      <span className="text-[11px] text-ink-3 line-through">{product.mrp}</span>
                    )}
                    {product.discount && (
                      <span className="text-[11px] font-semibold" style={{ color: 'var(--sale)' }}>
                        {product.discount} off
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}

          <ViewAllTile
            href="/products"
            label="View all best sellers"
            className="pcard-fixed snap-start"
          />
        </ScrollRail>
      </div>
    </section>
  );
};
