'use client';

import { useState } from 'react';

/**
 * Returns the full image URL for a Django FileField value, or `null` when the
 * value points to a known default placeholder path that doesn't actually
 * exist on disk. Used by `InitialsAvatar` callers to decide whether to even
 * attempt loading the image.
 */
export function resolveImageUrl(
  image: string | null | undefined,
  apiBase: string,
): string | null {
  if (!image) return null;
  // Django seeds FileField defaults like `default/default-service.jpg` or
  // `default/default-user.jpg` that aren't real files — treat as missing.
  if (image.includes('default/default-')) return null;
  return image.startsWith('http') ? image : `${apiBase}${image}`;
}

/**
 * Fallback avatar that renders an <img> when `src` loads successfully, and an
 * initials placeholder otherwise. Two modes:
 *   - `person`: "John Michael Doe" → "JD" (first letter of first name +
 *     first letter of last name). Used for patients and doctors.
 *   - `words`: "General Medicine Consultation" → "GMC" (first letter of
 *     each word, max 3). Used for services without images.
 */
type Mode = 'person' | 'words';
type Shape = 'circle' | 'rounded' | 'square';

interface InitialsAvatarProps {
  src: string | null | undefined;
  name: string;
  mode?: Mode;
  shape?: Shape;
  /** Tailwind sizing classes for the root element (width/height + text size). */
  className?: string;
  /** Text size class. Defaults to `text-base`. */
  textClassName?: string;
  /** Background and text color variant. */
  variant?: 'blue' | 'teal' | 'slate' | 'primary';
}

function personInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0][0]!.toUpperCase();
  // [first] [second?] [first_last] [second_last?]: use first + first_last
  const first = parts[0][0]!;
  const last = (parts.length >= 3 ? parts[2] : parts[1])[0]!;
  return (first + last).toUpperCase();
}

function wordsInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  // Take the first letter of up to 3 words.
  return parts.slice(0, 3).map((w) => w[0]!.toUpperCase()).join('');
}

const SHAPE_CLASS: Record<Shape, string> = {
  circle: 'rounded-full',
  rounded: 'rounded-lg',
  square: 'rounded-none',
};

const VARIANT_CLASS: Record<NonNullable<InitialsAvatarProps['variant']>, string> = {
  blue: 'bg-blue-100 text-blue-600',
  teal: 'bg-teal-100 text-teal-600',
  slate: 'bg-slate-200 text-slate-600',
  primary: 'bg-primary/10 text-primary',
};

export default function InitialsAvatar({
  src,
  name,
  mode = 'person',
  shape = 'circle',
  className = 'h-12 w-12',
  textClassName = 'text-base',
  variant = 'blue',
}: InitialsAvatarProps) {
  const [imgError, setImgError] = useState(false);

  const initials = mode === 'person' ? personInitials(name) : wordsInitials(name);

  const showImage = !!src && !imgError;

  if (showImage) {
    return (
      <img
        src={src!}
        alt={name}
        className={`${className} ${SHAPE_CLASS[shape]} object-cover`}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center font-bold ${className} ${SHAPE_CLASS[shape]} ${VARIANT_CLASS[variant]}`}
      aria-label={name}
    >
      <span className={textClassName}>{initials}</span>
    </div>
  );
}
