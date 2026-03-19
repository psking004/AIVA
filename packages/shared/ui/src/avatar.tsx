/**
 * Avatar Component
 */

import React from 'react';
import { cn } from './utils';

interface AvatarProps {
  src?: string;
  alt?: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt,
  name,
  size = 'md',
  className,
}) => {
  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  };

  const initials = name
    ? name.split(' ').map((n) => n[0]).join('').toUpperCase()
    : '?';

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-medium bg-gray-200 dark:bg-gray-700',
        sizes[size],
        className
      )}
    >
      {src ? (
        <img
          src={src}
          alt={alt || name || ''}
          className="w-full h-full rounded-full object-cover"
        />
      ) : (
        <span className="text-gray-600 dark:text-gray-300">{initials}</span>
      )}
    </div>
  );
};
