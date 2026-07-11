// ============================================
// FORMATTING UTILITIES
// ============================================

export const formatCurrency = (value: number, currency: string = 'INR'): string => {
  const formatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return formatter.format(value);
};

export const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
};

export const formatDate = (date: string | Date): string => {
  const d = new Date(date);
  return d.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export const formatDateTime = (date: string | Date): string => {
  const d = new Date(date);
  return d.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatPhoneNumber = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  return phone;
};

// ============================================
// STRING UTILITIES
// ============================================

export const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

export const capitalizeFirst = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export const capitalizeWords = (str: string): string => {
  return str
    .split(' ')
    .map((word) => capitalizeFirst(word.toLowerCase()))
    .join(' ');
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
};

// ============================================
// VALIDATION UTILITIES
// ============================================

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidPhone = (phone: string): boolean => {
  const phoneRegex = /^[0-9]{10}$/;
  return phoneRegex.test(phone.replace(/\D/g, ''));
};

export const isValidPassword = (password: string): boolean => {
  // Minimum 8 characters, at least one uppercase, one lowercase, one number
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  return passwordRegex.test(password);
};

export const isValidURL = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export const isValidGST = (gst: string): boolean => {
  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$/;
  return gstRegex.test(gst.toUpperCase());
};

// ============================================
// CALCULATION UTILITIES
// ============================================

export const calculateDiscount = (original: number, current: number): number => {
  if (original <= current) return 0;
  return Math.round(((original - current) / original) * 100);
};

export const calculateTax = (amount: number, taxRate: number = 18): number => {
  return Math.round((amount * taxRate) / 100);
};

export const calculateBulkDiscount = (quantity: number, price: number, discountTiers: any[]): number => {
  const tier = discountTiers.find((t) => quantity >= t.minQty && (!t.maxQty || quantity <= t.maxQty));
  if (tier) {
    return Math.round((tier.discount / 100) * price);
  }
  return 0;
};

// ============================================
// ARRAY UTILITIES
// ============================================

export const groupBy = <T, K extends PropertyKey>(array: T[], getKey: (item: T) => K): Record<K, T[]> => {
  return array.reduce(
    (result, item) => {
      const key = getKey(item);
      if (!result[key]) {
        result[key] = [];
      }
      result[key].push(item);
      return result;
    },
    {} as Record<K, T[]>
  );
};

export const unique = <T>(array: T[], key?: (item: T) => any): T[] => {
  if (key) {
    return Array.from(new Map(array.map((item) => [key(item), item])).values());
  }
  return Array.from(new Set(array));
};

// ============================================
// OBJECT UTILITIES
// ============================================

export const removeEmpty = (obj: Record<string, any>): Record<string, any> => {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null && v !== ''));
};

export const pick = <T, K extends keyof T>(obj: T, ...keys: K[]): Pick<T, K> => {
  const result = {} as Pick<T, K>;
  keys.forEach((key) => {
    result[key] = obj[key];
  });
  return result;
};

// ============================================
// STORAGE UTILITIES
// ============================================

export const getStorageItem = <T>(key: string, defaultValue?: T): T | null => {
  if (typeof window === 'undefined') return null;
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue ?? null;
  } catch {
    return defaultValue ?? null;
  }
};

export const setStorageItem = (key: string, value: any): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    console.error(`Failed to set storage item: ${key}`);
  }
};

export const removeStorageItem = (key: string): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(key);
};

// ============================================
// CLASS UTILITIES
// ============================================

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]): string => {
  return twMerge(clsx(inputs));
};

// ============================================
// TIME UTILITIES
// ============================================

export const getTimeAgo = (date: string | Date): string => {
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(seconds / 3600);
  const days = Math.floor(seconds / 86400);
  const weeks = Math.floor(seconds / 604800);
  const months = Math.floor(seconds / 2592000);
  const years = Math.floor(seconds / 31536000);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 4) return `${weeks}w ago`;
  if (months < 12) return `${months}mo ago`;
  return `${years}y ago`;
};

export const getDaysFromNow = (days: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

// ============================================
// EXPORT ALL
// ============================================

export const utils = {
  formatCurrency,
  formatPrice,
  formatDate,
  formatDateTime,
  formatPhoneNumber,
  slugify,
  capitalizeFirst,
  capitalizeWords,
  truncateText,
  isValidEmail,
  isValidPhone,
  isValidPassword,
  isValidURL,
  isValidGST,
  calculateDiscount,
  calculateTax,
  calculateBulkDiscount,
  groupBy,
  unique,
  removeEmpty,
  pick,
  getStorageItem,
  setStorageItem,
  removeStorageItem,
  cn,
  getTimeAgo,
  getDaysFromNow,
};
