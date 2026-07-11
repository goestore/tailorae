import React from 'react';
import { cn } from '@/utils/helpers';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info';
  children: React.ReactNode;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'primary', children, ...props }, ref) => {
    const variantClasses = {
      primary: 'badge-primary',
      secondary: 'badge-secondary',
      success: 'badge-success',
      danger: 'badge-danger',
      warning: 'badge-warning',
      info: 'badge-info',
    };

    return (
      <span
        ref={ref}
        className={cn('badge', variantClasses[variant], className)}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';