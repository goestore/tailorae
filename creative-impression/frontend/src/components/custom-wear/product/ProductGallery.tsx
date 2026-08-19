'use client';

import React, { useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useDispatch, useSelector } from 'react-redux';
import { customWearContent } from '@/config/custom-wear/content';
import { toggleWishlistItem } from '@/store/slices/customWear';
import type { RootState } from '@/store';
import type { CustomWearProduct } from '@/types/custom-wear';

export interface ProductGalleryProps {
  product: CustomWearProduct;
  /** Jumps to the variant shot when the buyer picks a colour. */
  activeColorId: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  front: 'Front',
  back: 'Back',
  side: 'Side',
  detail: 'Detail',
  fabric: 'Fabric',
  customization: 'Branding',
  lifestyle: 'On model',
  spec: 'Spec',
};

/**
 * Main image plus thumbnail rail.
 *
 * Arrow keys move between images when the gallery has focus, thumbnails are a
 * tablist, and hovering the main image magnifies it (pointer devices only —
 * touch users get a tap-to-zoom overlay instead).
 */
export const ProductGallery: React.FC<ProductGalleryProps> = ({ product, activeColorId }) => {
  const dispatch = useDispatch();
  const wishlist = useSelector((state: RootState) => state.customWear.wishlist);
  const isWishlisted = wishlist.includes(product.id);

  const images = useMemo(
    () => product.images.slice(0, customWearContent.productPage.galleryThumbnailCount),
    [product.images]
  );

  const [activeIndex, setActiveIndex] = useState(0);
  const [isZoomed, setZoomed] = useState(false);
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 });
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const frameRef = useRef<HTMLDivElement>(null);

  // A colour with its own shot takes the buyer straight to it. Handled during
  // render so the image swaps in the same paint as the swatch highlight.
  const [syncedColorId, setSyncedColorId] = useState(activeColorId);
  if (syncedColorId !== activeColorId) {
    setSyncedColorId(activeColorId);
    const color = product.colors.find((entry) => entry.id === activeColorId);
    const index = color?.imageId ? images.findIndex((image) => image.id === color.imageId) : -1;
    if (index >= 0) setActiveIndex(index);
  }

  const activeImage = images[activeIndex];
  const hasFailed = activeImage ? failedImages.has(activeImage.id) : true;

  const step = (delta: number) =>
    setActiveIndex((current) => (current + delta + images.length) % images.length);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(-1);
    }
  };

  const handlePointerMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isZoomed || !frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    setZoomOrigin({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    });
  };

  const markFailed = (id: string) => setFailedImages((current) => new Set(current).add(id));

  return (
    <div className="flex flex-col gap-3" onKeyDown={handleKeyDown}>
      {/* Main image */}
      <div
        ref={frameRef}
        className="group relative w-full overflow-hidden"
        style={{
          aspectRatio: '1 / 1',
          backgroundColor: 'var(--cw-surface-alt)',
          border: '1px solid var(--cw-border)',
          borderRadius: 'var(--cw-radius-card)',
        }}
        onMouseMove={handlePointerMove}
        onMouseLeave={() => setZoomed(false)}
      >
        {activeImage && !hasFailed ? (
          <button
            suppressHydrationWarning
            type="button"
            onClick={() => setZoomed((value) => !value)}
            className="block h-full w-full cursor-zoom-in"
            aria-label={isZoomed ? 'Zoom out' : 'Zoom in on product image'}
            style={{ cursor: isZoomed ? 'zoom-out' : 'zoom-in' }}
          >
            <Image
              src={activeImage.url}
              alt={activeImage.alt}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 46vw"
              className="object-cover transition-transform duration-300 ease-out"
              style={{
                transform: isZoomed ? 'scale(2)' : 'scale(1)',
                transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
              }}
              onError={() => markFailed(activeImage.id)}
            />
          </button>
        ) : (
          <div
            className="flex h-full w-full items-center justify-center px-6 text-center"
            style={{ color: 'var(--cw-ink-subtle)', fontSize: 'var(--cw-fs-small)' }}
          >
            Image unavailable — {product.name}
          </div>
        )}

        {/* Wishlist */}
        <button
          suppressHydrationWarning
          type="button"
          onClick={() => dispatch(toggleWishlistItem(product.id))}
          aria-pressed={isWishlisted}
          aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 shadow-sm transition-colors hover:bg-white"
          style={{ border: '1px solid var(--cw-border)' }}
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill={isWishlisted ? 'var(--cw-primary)' : 'none'}
            stroke={isWishlisted ? 'var(--cw-primary)' : 'var(--cw-ink-muted)'}
            strokeWidth={1.8}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 20.5s-7.5-4.6-7.5-9.8A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 3.1c0 5.2-7.5 9.8-7.5 9.8Z"
            />
          </svg>
        </button>

        {/* Arrows */}
        {images.length > 1 && (
          <>
            <GalleryArrow direction="left" onClick={() => step(-1)} />
            <GalleryArrow direction="right" onClick={() => step(1)} />
          </>
        )}

        {activeImage && (
          <span
            className="pointer-events-none absolute bottom-4 left-4"
            style={{
              backgroundColor: 'rgba(255,255,255,0.94)',
              border: '1px solid var(--cw-border)',
              borderRadius: 'var(--cw-radius-chip)',
              color: 'var(--cw-ink-muted)',
              fontFamily: 'var(--cw-font-body)',
              fontSize: '11px',
              fontWeight: 600,
              padding: '4px 9px',
            }}
          >
            {ROLE_LABELS[activeImage.role] ?? activeImage.role} · {activeIndex + 1}/{images.length}
          </span>
        )}
      </div>

      {/* Thumbnails */}
      <div
        role="tablist"
        aria-label={`${product.name} images`}
        className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
      >
        {images.map((image, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              suppressHydrationWarning
              key={image.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={`Show ${ROLE_LABELS[image.role] ?? image.role} image`}
              onClick={() => setActiveIndex(index)}
              className="relative h-[68px] w-[68px] flex-shrink-0 overflow-hidden transition-all sm:h-[80px] sm:w-[80px]"
              style={{
                backgroundColor: 'var(--cw-surface-alt)',
                borderRadius: 'var(--cw-radius-control)',
                border: `2px solid ${isActive ? 'var(--cw-primary)' : 'var(--cw-border)'}`,
              }}
            >
              {failedImages.has(image.id) ? (
                <span
                  className="flex h-full w-full items-center justify-center"
                  style={{ color: 'var(--cw-ink-subtle)', fontSize: '10px' }}
                >
                  {ROLE_LABELS[image.role] ?? '—'}
                </span>
              ) : (
                <Image
                  src={image.url}
                  alt=""
                  fill
                  sizes="80px"
                  loading="lazy"
                  className="object-cover"
                  onError={() => markFailed(image.id)}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const GalleryArrow: React.FC<{ direction: 'left' | 'right'; onClick: () => void }> = ({
  direction,
  onClick,
}) => (
  <button
    suppressHydrationWarning
    type="button"
    onClick={onClick}
    aria-label={direction === 'left' ? 'Previous image' : 'Next image'}
    className={`absolute top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 opacity-0 shadow-sm transition-opacity duration-200 hover:bg-white focus-visible:opacity-100 group-hover:opacity-100 ${
      direction === 'left' ? 'left-3' : 'right-3'
    }`}
    style={{ border: '1px solid var(--cw-border)' }}
  >
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      style={{ color: 'var(--cw-ink)' }}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={direction === 'left' ? 'm15 19-7-7 7-7' : 'm9 5 7 7-7 7'}
      />
    </svg>
  </button>
);
