'use client';

import React from 'react';
import Image from 'next/image';
import { cn } from '@/utils/helpers';
import { MediaPlaceholder, type MediaPlaceholderVariant } from '@/components/common/MediaPlaceholder';

export interface ProductThumbProps {
  /** Image source. May be a real URL or a hex color (e.g. "#d8cdcd") used as a placeholder. */
  src?: string | null;
  alt: string;
  className?: string;
  /** Print the name and "Image coming soon" on the placeholder when there is no photo. */
  showLabel?: boolean;
  /** Fill a positioned parent instead of sizing from `className`. */
  fill?: boolean;
  /** Passed to next/image for local assets; ignored for remote ones. */
  sizes?: string;
  priority?: boolean;
  /** What to draw when there is no image (or it fails to load). */
  placeholder?: MediaPlaceholderVariant;
}

/** True when the "image" value is actually a hex color placeholder (e.g. "#d8cdcd"). */
export const isColorThumb = (src?: string | null): src is string =>
  typeof src === 'string' && src.trim().startsWith('#');

/**
 * Product image that gracefully handles the catalog's hex-color placeholder
 * "thumbnails" while still supporting real image URLs.
 */
export const ProductThumb: React.FC<ProductThumbProps> = ({
  src,
  alt,
  className,
  showLabel = false,
  fill = false,
  sizes,
  priority = false,
  placeholder = 'product',
}) => {
  const url: string | null | undefined = src;

  // A hex "image" is a colour-only product: draw the garment in that colour.
  if (isColorThumb(src)) {
    return (
      <MediaPlaceholder
        variant={placeholder}
        name={alt}
        tint={src}
        fill={fill}
        bare={!showLabel}
        className={className}
      />
    );
  }

  if (url) {
    // Assets we ship ourselves live under /images and can go through the image
    // optimizer. Everything else can come from an arbitrary host (e.g.
    // picsum.photos) that is not in next.config's allowlist, so it has to stay a
    // plain <img> — next/image would throw on an unconfigured hostname.
    if (fill && url.startsWith('/')) {
      return (
        <Image
          src={url}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className={cn('object-cover', className)}
        />
      );
    }

    return (
      <RemoteThumb url={url} alt={alt} fill={fill} className={className} placeholder={placeholder} />
    );
  }

  return (
    <MediaPlaceholder
      variant={placeholder}
      name={alt}
      fill={fill}
      bare={!showLabel}
      className={className}
    />
  );
};

/**
 * A plain <img> for hosts outside the optimizer's allowlist. Marketplace CDNs
 * often refuse hotlinks, so a failed load falls back to the neutral
 * placeholder instead of the browser's broken-image icon and alt text.
 */
function RemoteThumb({
  url,
  alt,
  fill,
  className,
  placeholder,
}: {
  url: string;
  alt: string;
  fill: boolean;
  className?: string;
  placeholder: MediaPlaceholderVariant;
}) {
  const [failed, setFailed] = React.useState(false);
  // A server-rendered <img> can fail before React hydrates, and then onError
  // never fires. Check once on mount: a finished load with no pixels is a failure.
  const checkLoaded = React.useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, []);
  if (failed) {
    return <MediaPlaceholder variant={placeholder} name={alt} fill={fill} bare className={className} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={checkLoaded}
      src={url}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn('object-cover', fill && 'absolute inset-0 h-full w-full', className)}
    />
  );
}
