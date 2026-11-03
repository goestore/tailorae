import React from 'react';
import { cn } from '@/utils/helpers';

export interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  className,
  size = 'md',
  ...props
}) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  return (
    <div className={cn('flex items-center justify-center', className)} {...props}>
      <svg
        className={cn('animate-spin text-primary-600', sizeClasses[size])}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    </div>
  );
};

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  height?: string;
  width?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className,
  height = 'h-4',
  width = 'w-full',
  ...props
}) => {
  return (
    <div
      className={cn(
        // Tokens, not Tailwind's neutral ramp: a placeholder that is a
        // different grey from every surface around it reads as a broken
        // image rather than as content arriving.
        'skeleton-block animate-pulse',
        height,
        width,
        className
      )}
      {...props}
    />
  );
};

export interface SkeletonTextProps extends React.HTMLAttributes<HTMLDivElement> {
  lines?: number;
  lineHeight?: string;
}

export const SkeletonText: React.FC<SkeletonTextProps> = ({
  className,
  lines = 3,
  lineHeight = 'h-4',
  ...props
}) => {
  return (
    <div className={cn('space-y-2', className)} {...props}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          height={lineHeight}
          width={index === lines - 1 ? 'w-3/4' : 'w-full'}
        />
      ))}
    </div>
  );
};

/**
 * The shapes the storefront actually waits on.
 *
 * Every route that fetched anything rendered a centred spinner on an otherwise
 * blank page — so a slow connection saw the header, a void, and then the whole
 * page at once. A skeleton in roughly the shape of what is coming keeps the
 * layout still and makes the wait legible. `Skeleton` and `SkeletonText` were
 * already here and used by nothing; these give them somewhere to go.
 */

/** A cart or wishlist line: thumbnail, two lines of text, a price. */
export const SkeletonLine: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('flex items-center gap-4 border-b border-line py-4', className)}>
    <Skeleton height="h-20" width="w-16" className="flex-shrink-0" />
    <div className="min-w-0 flex-1 space-y-2">
      <Skeleton height="h-3.5" width="w-2/5" />
      <Skeleton height="h-3" width="w-1/4" />
    </div>
    <Skeleton height="h-4" width="w-16" className="flex-shrink-0" />
  </div>
);

/** A stack of lines, for a list whose length is not yet known. */
export const SkeletonList: React.FC<{ rows?: number; className?: string }> = ({
  rows = 3,
  className,
}) => (
  <div className={className} aria-hidden="true">
    {Array.from({ length: rows }).map((_, index) => (
      <SkeletonLine key={index} />
    ))}
  </div>
);

/** A bordered panel with a heading and a few lines — an order card, a summary. */
export const SkeletonPanel: React.FC<{ lines?: number; className?: string }> = ({
  lines = 3,
  className,
}) => (
  <div className={cn('border border-line p-5', className)} aria-hidden="true">
    <Skeleton height="h-3" width="w-24" />
    <div className="mt-4">
      <SkeletonText lines={lines} lineHeight="h-3.5" />
    </div>
  </div>
);
