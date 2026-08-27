'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ScrollRail } from '@/components/common';
import { CATEGORY_TILES } from '@/config/home-categories';

export interface Category {
  id: string;
  name: string;
  image: string;
  link: string;
}

export interface CategoryCarouselProps {
  categories?: Category[];
  title?: string;
}


export const CategoryCarousel: React.FC<CategoryCarouselProps> = ({
  categories = CATEGORY_TILES,
  title = 'EXPLORE ALL CATEGORIES',
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

        <ScrollRail label="categories">
          {categories.map((category) => {
            const isMissing = missingImages.has(category.id);

            return (
              <Link
                key={category.id}
                href={category.link}
                className="ctile group snap-start no-underline"
              >
                <div className="ctile-media">
                  {isMissing ? (
                    <div className="flex h-full w-full items-center justify-center text-base font-semibold text-ink-3">
                      {getInitials(category.name)}
                    </div>
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
                <h3 className="line-clamp-2 text-[12px] font-normal leading-[1.3] text-ink">
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
