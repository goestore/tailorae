'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MediaPlaceholder, ScrollRail } from '@/components/common';

export interface Category {
  id: string;
  name: string;
  image: string;
  link: string;
}

export interface CategoryCarouselProps {
  categories: Category[];
  title?: string;
}

export const CategoryCarousel: React.FC<CategoryCarouselProps> = ({
  categories,
  title = 'EXPLORE ALL CATEGORIES',
}) => {
  const [missingImages, setMissingImages] = useState<Set<string>>(new Set());

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

        <ScrollRail label="categories">
          {categories.map((category) => {
            const isMissing = !category.image || missingImages.has(category.id);

            return (
              <Link
                key={category.id}
                href={category.link}
                className="ctile group snap-start no-underline"
              >
                <div className="ctile-media">
                  {isMissing ? (
                    <MediaPlaceholder variant="category" name={category.name} />
                  ) : (
                    <Image
                      src={category.image}
                      alt={category.name}
                      width={280}
                      height={280}
                      sizes="(max-width: 640px) 28vw, 140px"
                      className="h-full w-full object-cover"
                      onError={() => handleImageError(category.id)}
                    />
                  )}
                </div>
                <h3 className="line-clamp-2 text-small font-normal leading-[1.3] text-ink">
                  {category.name}
                </h3>
              </Link>
            );
          })}
        </ScrollRail>
      </div>
    </section>
  );
};
