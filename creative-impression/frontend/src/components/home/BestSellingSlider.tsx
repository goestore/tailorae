'use client';

import React, { useRef, useLayoutEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

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
    image: '/images/Women Polo T-Shirt.png',
    link: '/products/womens/polo-t-shirt',
    mrp: '₹799',
    sellingPrice: '₹499',
    discount: '38%',
  },
  {
    id: '2',
    name: 'Classic Round Neck',
    image: '/images/Mens Polo T-Shirt.png',
    link: '/products/mens/round-neck-tshirts',
    mrp: '₹599',
    sellingPrice: '₹399',
    discount: '33%',
  },
  {
    id: '3',
    name: 'Formal Men Shirt',
    image: '/images/Mens Shirt.png',
    link: '/products/mens/shirts',
    mrp: '₹1,299',
    sellingPrice: '₹899',
    discount: '31%',
  },
  {
    id: '4',
    name: 'Trendy Women Top',
    image: '/images/Women Top.png',
    link: '/products/womens/tops-tunics',
    mrp: '₹899',
    sellingPrice: '₹599',
    discount: '33%',
  },
  {
    id: '5',
    name: 'Kids Polo T-Shirt',
    image: '/images/Boys Polo T-Shirts.png',
    link: '/products/kids/boys-polo-tshirt',
    mrp: '₹499',
    sellingPrice: '₹349',
    discount: '30%',
  },
  {
    id: '6',
    name: 'Custom Print Tee',
    image: '/images/Round Neck T-Shirt.png',
    link: '/custom-printing',
    mrp: '₹699',
    sellingPrice: '₹449',
    discount: '36%',
  },
];

export const BestSellingSlider: React.FC<BestSellingSliderProps> = ({
  products = DEFAULT_PRODUCTS,
  title = 'BEST SELLING',
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
          className="explore-categories-title text-black mb-4 md:mb-6 lg:mb-8 text-left"
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
            className="flex gap-3 sm:gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-4 scrollbar-hide touch-pan-x"
            style={{ scrollBehavior: 'smooth' }}
          >
            {products.map((product) => {
              const isMissing = missingImages.has(product.id);

              return (
                <Link
                  key={product.id}
                  href={product.link}
                  className="best-selling-card flex-shrink-0 snap-start group block no-underline"
                  style={{
                    minWidth: '260px',
                    width: '100%',
                    maxWidth: '320px',
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
                    className="best-selling-image-wrapper"
                    style={{
                      width: '100%',
                      aspectRatio: '3 / 4',
                      overflow: 'hidden',
                      flexShrink: 0,
                      position: 'relative',
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
                        {getInitials(product.name)}
                      </div>
                    ) : (
                      <Image
                        src={product.image}
                        alt={product.name}
                        width={320}
                        height={420}
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
                        onError={() => handleImageError(product.id)}
                      />
                    )}
                    {product.discount && (
                      <span
                        style={{
                          position: 'absolute',
                          top: '8px',
                          left: '8px',
                          background: '#E53935',
                          color: '#FBB602',
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          lineHeight: 1.2,
                        }}
                      >
                        {product.discount} OFF
                      </span>
                    )}
                  </div>
                  <div
                    className="best-selling-info"
                    style={{
                      padding: '12px 12px 14px',
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        color: '#111111',
                        fontSize: 'clamp(13px, 1.3vw, 15px)',
                        fontWeight: 600,
                        lineHeight: 1.3,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        fontFamily: 'var(--font-inter), var(--font-playfair), sans-serif',
                      }}
                    >
                      {product.name}
                    </h3>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: '8px',
                        flexWrap: 'wrap',
                      }}
                    >
                      {product.mrp && (
                        <span
                          style={{
                            margin: 0,
                            color: '#999999',
                            fontSize: 'clamp(12px, 1.2vw, 14px)',
                            fontWeight: 400,
                            textDecoration: 'line-through',
                            lineHeight: 1.2,
                            fontFamily: 'var(--font-inter), var(--font-playfair), sans-serif',
                          }}
                        >
                          MRP {product.mrp}
                        </span>
                      )}
                      {product.sellingPrice && (
                        <span
                          style={{
                            margin: 0,
                            color: '#111111',
                            fontSize: 'clamp(14px, 1.4vw, 17px)',
                            fontWeight: 700,
                            lineHeight: 1.2,
                            fontFamily: 'var(--font-inter), var(--font-playfair), sans-serif',
                          }}
                        >
                          {product.sellingPrice}
                        </span>
                      )}
                    </div>
                  </div>
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
                  className="absolute left-2 lg:left-4 top-[35%] lg:top-[40%] -translate-y-1/2 w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-white/90 border border-neutral-200 shadow-lg items-center justify-center hover:bg-neutral-50 transition-colors z-10"
                  aria-label="Scroll best selling left"
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
                  className="absolute right-2 lg:right-4 top-[35%] lg:top-[40%] -translate-y-1/2 w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-white/90 border border-neutral-200 shadow-lg items-center justify-center hover:bg-neutral-50 transition-colors z-10"
                  aria-label="Scroll best selling right"
                >
                  <svg className="h-5 w-5 lg:h-6 lg:w-6 text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <Link
            href="/products"
            className="text-sm font-semibold text-neutral-700 hover:text-neutral-900 transition-colors"
            style={{ fontFamily: 'var(--font-inter), var(--font-playfair), sans-serif' }}
          >
            View All Best Sellers →
          </Link>
        </div>
      </div>
    </section>
  );
};
