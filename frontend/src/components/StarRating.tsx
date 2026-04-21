'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StarRatingProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  interactive?: boolean;
  onChange?: (value: number) => void;
  className?: string;
}

const sizeClasses = {
  sm: 'h-3.5 w-3.5',
  md: 'h-5 w-5',
  lg: 'h-7 w-7',
};

export default function StarRating({
  value,
  max = 5,
  size = 'md',
  interactive = false,
  onChange,
  className,
}: StarRatingProps) {
  const [hover, setHover] = useState<number | null>(null);
  const displayed = hover ?? value;

  return (
    <div className={cn('inline-flex items-center gap-0.5', className)}>
      {Array.from({ length: max }).map((_, i) => {
        const starValue = i + 1;
        const filled = displayed >= starValue;
        const halfFilled = !filled && displayed >= starValue - 0.5;

        const star = (
          <Star
            className={cn(
              sizeClasses[size],
              filled ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40',
              halfFilled && 'fill-amber-400/50 text-amber-400',
              interactive && 'cursor-pointer transition-transform hover:scale-110',
            )}
          />
        );

        if (!interactive) return <span key={i}>{star}</span>;

        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange?.(starValue)}
            onMouseEnter={() => setHover(starValue)}
            onMouseLeave={() => setHover(null)}
            aria-label={`${starValue} star${starValue > 1 ? 's' : ''}`}
          >
            {star}
          </button>
        );
      })}
    </div>
  );
}
