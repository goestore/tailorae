'use client';

import React, { useRef, useLayoutEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

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

const DEFAULT_CATEGORIES: Category[] = [
  { id: '1', name: "Women's Polo T-Shirt", image: '/images/Women Polo T-Shirt.png', link: '/products/womens/polo-t-shirt' },
  { id: '2', name: "Men's Polo T-Shirt", image: '/images/Mens Polo T-Shirt.png', link: '/products/mens/polo-t-shirt' },
  { id: '3', name: "Women's Tops", image: '/images/Women Top.png', link: '/products/womens/tops-tunics' },
  { id: '4', name: "Men's Round Neck T-Shirt", image: '/images/Round Neck T-Shirt.png', link: '/products/mens/round-neck-tshirts' },
  { id: '6', name: "Boy's Polo T-Shirt", image: '/images/Boys Polo T-Shirts.png', link: '/products/kids/boys-polo-tshirt' },
  { id: '5', name: "Men's Shirt", image: '/images/Mens Shirt.png', link: '/products/mens/shirts' },
  { id: '7', name: "Boy's Round Neck T-Shirt", image: '/images/WINTER.jpg', link: '/products/kids/boys-round-neck-tshirt' },
  { id: '8', name: "Girl's Polo T-Shirt", image: '/images/WINTER.jpg', link: '/products/kids/girl-polo-tshirt' },
  { id: '9', name: "Girl's Top", image: '/images/WINTER.jpg', link: '/products/kids/girl-tops' },
  { id: '10', name: 'Custom Wear', image: '/images/WINTER.jpg', link: '/custom-printing' },
  { id: '11', name: 'Plus Size', image: '/images/WINTER.jpg', link: '/products/womens/plus-size' },
];

export const CategoryCarousel: React.FC<CategoryCarouselProps> = ({
  categories = DEFAULT_CATEGORIES,
  title = 'EXPLORE ALL CATEGORIES',
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
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

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 1;
    const scrollLeft = el.scrollLeft;
    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(scrollLeft > threshold);
    setCanScrollRight(maxScrollLeft - scrollLeft > threshold);
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    checkScroll();

    const handleScroll = () => checkScroll();
    const handleResize = () => checkScroll();

    el.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    return () => {
      el.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const scrollByAmount = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollAmount = el.clientWidth * 0.7;
    el.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
  };

  return (
    <section className="py-0 bg-white">
      <div className="mx-auto w-full px-2 sm:px-4 md:px-6 lg:px-8">
        <h2
          className="explore-categories-title text-black mb-4 md:mb-6 lg:mb-8"
          style={{
            fontFamily: 'var(--font-playfair)',
            fontSize: 'clamp(15px, 3vw, 30px)',
            lineHeight: 1,
            fontWeight: 700,
            letterSpacing: '0.05em',
            color: '#282727',
          }}
        >
          {title}
        </h2>

        <div className="relative">
          <div
            ref={scrollRef}
            className="flex gap-2 sm:gap-3 md:gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-4 scrollbar-hide touch-pan-x"
            style={{ scrollBehavior: 'smooth' }}
          >
            {categories.map((category) => {
              const isMissing = missingImages.has(category.id);

              return (
                <Link
                  key={category.id}
                  href={category.link}
                  className="category-card flex-shrink-0 snap-start group block no-underline"
                  style={{
                    minWidth: '210px',
                    minHeight: '280px',
                    width: '100%',
                    maxWidth: '260px',
                    border: '1px solid #000000',
                    borderRadius: '18px',
                    overflow: 'hidden',
                    background: '#ffffff',
                    textDecoration: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'border-color 0.3s ease, box-shadow 0.3s ease, transform 0.3s ease',
                  }}
                  onMouseEnter={(e) => {
                    const target = e.currentTarget;
                    target.style.borderColor = '#FBB602';
                    target.style.boxShadow = '0 8px 24px rgba(251, 182, 2, 0.18)';
                    target.style.transform = 'translateY(-4px)';
                  }}
                  onMouseLeave={(e) => {
                    const target = e.currentTarget;
                    target.style.borderColor = '#000000';
                    target.style.boxShadow = 'none';
                    target.style.transform = 'translateY(0)';
                  }}
                  onFocus={(e) => {
                    const target = e.currentTarget;
                    target.style.borderColor = '#FBB602';
                    target.style.boxShadow = '0 8px 24px rgba(251, 182, 2, 0.18)';
                    target.style.transform = 'translateY(-4px)';
                  }}
                  onBlur={(e) => {
                    const target = e.currentTarget;
                    target.style.borderColor = '#000000';
                    target.style.boxShadow = 'none';
                    target.style.transform = 'translateY(0)';
                  }}
                >
                  <div
                    className="category-image-wrapper"
                    style={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      overflow: 'hidden',
                      flexShrink: 0,
                    }}
                  >
                    {isMissing ? (
                      <div
                        className="flex items-center justify-center w-full h-full"
                        style={{
                          width: '100%',
                          height: '100%',
                          background: '#f5f5f5',
                          color: '#666666',
                          fontSize: 'clamp(14px, 1.4vw, 18px)',
                          fontWeight: 600,
                          textAlign: 'center',
                        }}
                      >
                        {getInitials(category.name)}
                      </div>
                    ) : (
                      <Image
                        src={category.image}
                        alt={category.name}
                        width={400}
                        height={400}
                        className="block"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          transition: 'transform 0.3s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'scale(1.03)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                        onError={() => handleImageError(category.id)}
                      />
                    )}
                  </div>
                  <h3
                    className="category-title"
                    style={{
                      padding: '14px 12px 16px',
                      margin: 0,
                      textAlign: 'center',
                      color: '#111111',
                      fontSize: 'clamp(13px, 1.3vw, 16px)',
                      fontWeight: 600,
                      lineHeight: 1.4,
                      transition: 'color 0.3s ease',
                      fontFamily: 'var(--font-inter), var(--font-playfair), sans-serif',
                    }}
                  >
                    {category.name}
                  </h3>
                </Link>
              );
            })}
          </div>

          {(canScrollLeft || canScrollRight) && (
            <>
              {canScrollLeft && (
                <button
                  type="button"
                  onClick={() => scrollByAmount('left')}
                  className="hidden md:flex absolute left-2 lg:left-4 top-[35%] lg:top-[40%] -translate-y-1/2 w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-white/90 border border-neutral-200 shadow-lg items-center justify-center hover:bg-neutral-50 transition-colors z-10"
                  aria-label="Scroll categories left"
                >
                  <svg className="h-5 w-5 lg:h-6 lg:w-6 text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}

              {canScrollRight && (
                <button
                  type="button"
                  onClick={() => scrollByAmount('right')}
                  className="absolute right-2 md:right-4 top-[35%] md:top-[40%] -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/90 border border-neutral-200 shadow-lg items-center justify-center hover:bg-neutral-50 transition-colors z-10"
                  aria-label="Scroll categories right"
                >
                  <svg className="h-5 w-5 md:h-6 md:w-6 text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
};
