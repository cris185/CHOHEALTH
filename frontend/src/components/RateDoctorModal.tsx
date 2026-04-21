'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { reviews as reviewsApi, ReviewItem } from '@/lib/api';
import { Button } from '@/components/ui/button';
import StarRating from '@/components/StarRating';

interface RateDoctorModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointmentSid: string;
  doctorName: string;
  doctorSpecialization?: string | null;
  existingReview?: ReviewItem | null;
  onSaved?: (review: ReviewItem) => void;
}

export default function RateDoctorModal({
  isOpen,
  onClose,
  appointmentSid,
  doctorName,
  doctorSpecialization,
  existingReview,
  onSaved,
}: RateDoctorModalProps) {
  const t = useTranslations();
  const [rating, setRating] = useState(existingReview?.rating ?? 0);
  const [comment, setComment] = useState(existingReview?.comment ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setRating(existingReview?.rating ?? 0);
      setComment(existingReview?.comment ?? '');
      setError('');
    }
  }, [isOpen, existingReview]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (rating < 1 || rating > 5) {
      setError(t('reviews.errorRating'));
      return;
    }
    const token = localStorage.getItem('access_token');
    if (!token) {
      setError(t('reviews.errorAuth'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const saved = await reviewsApi.createOrUpdate(
        { appointment_sid: appointmentSid, rating, comment: comment.trim() },
        token,
      );
      onSaved?.(saved);
      onClose();
    } catch (err: unknown) {
      const apiErr = err as { data?: { detail?: string } };
      setError(apiErr?.data?.detail || t('reviews.errorSubmit'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md rounded-2xl bg-background shadow-2xl">
        <div className="flex items-start justify-between border-b px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold">{t('reviews.modalTitle')}</h3>
            <p className="text-sm text-muted-foreground">
              {doctorName}
              {doctorSpecialization ? ` · ${doctorSpecialization}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex flex-col items-center gap-2">
            <p className="text-sm font-medium">{t('reviews.howManyStars')}</p>
            <StarRating value={rating} interactive onChange={setRating} size="lg" />
          </div>

          <div>
            <label htmlFor="review-comment" className="block text-sm font-medium">
              {t('reviews.commentLabel')}
            </label>
            <textarea
              id="review-comment"
              rows={4}
              maxLength={1000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t('reviews.commentPlaceholder')}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1 text-xs text-muted-foreground text-right">{comment.length}/1000</p>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('reviews.cancel')}
            </Button>
            <Button type="submit" disabled={submitting || rating === 0}>
              {submitting ? t('reviews.submitting') : existingReview ? t('reviews.update') : t('reviews.submit')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
