import React from 'react';
import { cn } from '@/utils/helpers';

export interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  position?: 'left' | 'right';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  title,
  children,
  position = 'left',
  size = 'md',
}) => {
  const sizeClasses = {
    sm: 'w-64',
    md: 'w-80',
    lg: 'w-96',
    xl: 'w-[28rem]',
  };

  const positionClasses = {
    left: 'left-0',
    right: 'right-0',
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'fixed top-0 z-50 h-full transform bg-white shadow-xl transition-transform duration-300 ease-in-out dark:bg-neutral-900',
          sizeClasses[size],
          positionClasses[position],
          isOpen ? 'translate-x-0' : position === 'left' ? '-translate-x-full' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b border-neutral-200 px-4 dark:border-neutral-800">
          {title && (
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              {title}
            </h2>
          )}
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </>
  );
};

export interface SidebarSectionProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const SidebarSection: React.FC<SidebarSectionProps> = ({
  title,
  children,
  className,
}) => {
  return (
    <div className={cn('mb-6', className)}>
      {title && (
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-900 dark:text-neutral-100">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
};

export interface SidebarItemProps {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({
  children,
  onClick,
  active,
  disabled,
  className,
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full rounded-lg px-3 py-2 text-left text-sm transition-colors',
        active
          ? 'bg-primary-50 text-primary-700 dark:bg-primary-900 dark:text-primary-200'
          : 'text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      {children}
    </button>
  );
};