import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface BannerItem {
  image: string;
  href?: string;
  alt?: string;
}

interface DualPromoBannerProps {
  left: BannerItem;
  right: BannerItem;
  divider?: number;
  className?: string;
  aspectRatio?: string;
}

const isExternalUrl = (url?: string) => url?.startsWith('http') ?? false;

export const DualPromoBanner: React.FC<DualPromoBannerProps> = ({
  left,
  right,
  divider = 0,
  className = '',
  aspectRatio = 'aspect-video',
}) => {
  const renderBanner = (item: BannerItem, index: number) => {
    const imageElement = (
      <div className={`relative w-full ${aspectRatio} overflow-hidden group`}>
        <Image
          src={item.image}
          alt={item.alt || ''}
          width={1200}
          height={675}
          className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
          priority={index === 0}
        />
      </div>
    );

    if (!item.href) return imageElement;

    if (isExternalUrl(item.href)) {
      return (
        <a
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full"
        >
          {imageElement}
        </a>
      );
    }

    return (
      <Link href={item.href} className="block w-full">
        {imageElement}
      </Link>
    );
  };

  return (
    <section className={`w-full ${className}`}>
      <div
        className="flex flex-col md:flex-row"
        style={{ gap: divider }}
      >
        {[left, right].map((item, index) => (
          <div key={index} className="w-full md:w-1/2">
            {renderBanner(item, index)}
          </div>
        ))}
      </div>
    </section>
  );
};
