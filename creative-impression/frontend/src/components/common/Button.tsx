"use client";

import React, { useState } from 'react';
import { cn } from '@/utils/helpers';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  fullWidth?: boolean;
  loading?: boolean;
  persistent?: boolean;
  children: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', block, fullWidth, loading, disabled, children, persistent = false, onClick, ...props }, ref) => {
    const [isClicked, setIsClicked] = useState(false);

    const isFullWidth = block || fullWidth;
    const baseClasses = 'btn';
    const variantClasses = {
      primary: 'btn-primary',
      secondary: 'btn-secondary',
      outline: 'btn-outline',
      ghost: 'btn-ghost',
      danger: 'btn-danger',
      success: 'btn-success',
    };
    const sizeClasses = {
      sm: 'btn-sm',
      md: '',
      lg: 'btn-lg',
    };

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (persistent) {
        setIsClicked(true);
      }
      onClick?.(e);
    };

    return (
      <button
        ref={ref}
        className={cn(
          baseClasses,
          !isClicked && variantClasses[variant],
          sizeClasses[size],
          isFullWidth && 'btn-block',
          loading && 'opacity-75 cursor-wait',
          isClicked && persistent && 'bg-yellow-400 text-black',
          className
        )}
        disabled={disabled || loading}
        onClick={handleClick}
        suppressHydrationWarning={true}
        {...props}
      >
        {loading && (
          <svg
            className="mr-2 h-4 w-4 animate-spin"
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
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';