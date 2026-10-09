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
  products: BestSellingProduct[];
  title?: string;
}


export const BestSellingSlider: React.FC<BestSellingSliderProps> = ({
  products,
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
        <div className="section-head">
          <h2 className="heading-rule">{title}</h2>
        </div>

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
                      // Imported listings point at marketplace CDNs that are not
                      // in next.config's allowlist; those load as plain images
                      // instead of crashing the whole homepage.
                      unoptimized={/^https?:\/\//.test(product.image)}
                      onError={() => handleImageError(product.id)}
                    />
                  )}
                </div>

                {/* Same caption as every other product card (BaseProductCard). */}
                <div className="pcard-body">
                  <h3 className="pcard-name">
                    <span className="pcard-title" title={product.name}>
                      {product.name}
                    </span>
                  </h3>
                  <p className="pcard-price">
                    {product.sellingPrice}
                    {product.mrp && <span className="pcard-compare">{product.mrp}</span>}
                    {product.discount && <span className="pcard-off">{product.discount}</span>}
                  </p>
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
