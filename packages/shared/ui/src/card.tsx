/**
 * Card Component
 */

import React from 'react';
import { cn } from './utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({ children, className, padding = 'md' }) => {
  const paddingStyles = {
    none: 'p-0',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  return (
    <div className={cn('bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800', paddingStyles[padding], className)}>
      {children}
    </div>
  );
};

export const CardHeader: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn('border-b border-gray-200 dark:border-gray-800 -mx-4 -mt-4 mb-4 px-4 pt-4 pb-3', className)}>
    {children}
  </div>
);

export const CardTitle: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <h3 className={cn('font-semibold text-lg', className)}>
    {children}
  </h3>
);

export const CardContent: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={className}>{children}</div>
);

export const CardFooter: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn('border-t border-gray-200 dark:border-gray-800 -mx-4 -mb-4 mt-4 px-4 pt-3 pb-4', className)}>
    {children}
  </div>
);
