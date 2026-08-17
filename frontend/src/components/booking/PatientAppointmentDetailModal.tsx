'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AppointmentItem, reviews as reviewsApi, ReviewItem } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import StarRating from '@/components/StarRating';
import RateDoctorModal from '@/components/RateDoctorModal';
import {
  CalendarDays,
  Clock,
  MapPin,
  Video,
  DollarSign,
  FileText,
  User,
  AlertCircle,
  X,
  ExternalLink,
  Star,
} from 'lucide-react';

interface PatientAppointmentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: AppointmentItem | null;
}

const statusVariant: Record<string, string> = {
  Pending: 'bg-blue-50 text-blue-700 border-blue-200',
  'Pending Payment': 'bg-amber-50 text-amber-700 border-amber-200',
  Confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'In Progress': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Completed: 'bg-slate-100 text-slate-600 border-slate-200',
  Cancelled: 'bg-red-50 text-red-700 border-red-200',
};

export default function PatientAppointmentDetailModal({
  isOpen,
  onClose,
  appointment,
}: PatientAppointmentDetailModalProps) {
  const t = useTranslations();
  const [existingReview, setExistingReview] = useState<ReviewItem | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);

  // Look up whether this patient already rated this appointment. Doing it
  // on open keeps the list query cheap (one extra fetch only when the user
  // actually opens the detail modal).
  useEffect(() => {
    if (!isOpen || !appointment || appointment.status !== 'Completed' || !appointment.doctor_sid) {
      setExistingReview(null);
      return;
    }
    const token = localStorage.getItem('access_token') || '';
    if (!token) return;
    setReviewLoading(true);
    reviewsApi.mine(token)
      .then((list) => {
        const match = list.find((r) => r.appointment_sid === appointment.sid) ?? null;
        setExistingReview(match);
      })
      .catch(() => setExistingReview(null))
      .finally(() => setReviewLoading(false));
  }, [isOpen, appointment]);

  if (!isOpen || !appointment) return null;

  const appointmentDate = new Date(appointment.date);
  const isVirtual = appointment.mode === 'Virtual';
  const canRate = appointment.status === 'Completed' && !!appointment.doctor_sid;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">{appointment.doctor_name}</h3>
              <p className="text-sm text-muted-foreground">{appointment.service_name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status + Mode */}
        <div className="flex items-center gap-2 px-6 py-4">
          <Badge variant="outline" className={statusVariant[appointment.status] || ''}>
            {appointment.status}
          </Badge>
          <Badge variant="outline" className="gap-1">
            {isVirtual ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
            {appointment.mode}
          </Badge>
        </div>

        <Separator />

        {/* Details */}
        <div className="space-y-4 px-6 py-5">
          {/* Date & time */}
          <div className="flex items-start gap-3">
            <CalendarDays className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-xs font-medium text-muted-foreground">Date &amp; Time</p>
              <p className="text-sm">
                {appointmentDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                  timeZone: 'America/New_York',
                })}
                {' · '}
                {appointmentDate.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'America/New_York',
                })}
              </p>
            </div>
          </div>

          {/* Duration */}
          <div className="flex items-start gap-3">
            <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-xs font-medium text-muted-foreground">Duration</p>
              <p className="text-sm">{appointment.service_duration} min</p>
            </div>
          </div>

          {/* Cost */}
          <div className="flex items-start gap-3">
            <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-xs font-medium text-muted-foreground">Cost</p>
              <p className="text-sm font-semibold">${appointment.service_cost}</p>
            </div>
          </div>

          {/* Branch or Meeting link */}
          {isVirtual ? (
            appointment.meeting_link && (
              <div className="flex items-start gap-3">
                <Video className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">Meeting link</p>
                  <a
                    href={appointment.meeting_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1 break-all"
                  >
                    {appointment.meeting_provider || 'Join meeting'}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
              </div>
            )
          ) : (
            appointment.branch_name && (
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Branch</p>
                  <p className="text-sm">{appointment.branch_name}</p>
                </div>
              </div>
            )
          )}

          {/* Issues / symptoms */}
          {(appointment.issues || appointment.symptoms) && (
            <>
              <Separator />
              {appointment.issues && (
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Issues</p>
                    <p className="text-sm">{appointment.issues}</p>
                  </div>
                </div>
              )}
              {appointment.symptoms && (
                <div className="flex items-start gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Symptoms</p>
                    <p className="text-sm">{appointment.symptoms}</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Doctor's notes */}
          {appointment.notes && (
            <>
              <Separator />
              <div className="flex items-start gap-3">
                <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Doctor&apos;s notes</p>
                  <p className="text-sm">{appointment.notes}</p>
                </div>
              </div>
            </>
          )}

          {/* Cancel info */}
          {appointment.cancelled_at && (
            <>
              <Separator />
              <div className="rounded-lg bg-red-50 p-3">
                <p className="text-xs font-medium text-red-700">
                  Cancelled by {appointment.cancelled_by || 'system'}
                </p>
                {appointment.cancel_reason && (
                  <p className="text-sm text-red-700 mt-1">{appointment.cancel_reason}</p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Rating (only when completed) */}
        {canRate && !reviewLoading && (
          <>
            <Separator />
            <div className="px-6 py-4">
              {existingReview ? (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center gap-2">
                    <StarRating value={existingReview.rating} size="sm" />
                    <span className="text-xs text-muted-foreground">
                      {t('reviews.editCta')}
                    </span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setRateOpen(true)}>
                    <Star className="mr-1 h-4 w-4" />
                    {t('reviews.update')}
                  </Button>
                </div>
              ) : (
                <Button className="w-full" onClick={() => setRateOpen(true)}>
                  <Star className="mr-1 h-4 w-4" />
                  {t('reviews.rateCta')}
                </Button>
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      {canRate && (
        <RateDoctorModal
          isOpen={rateOpen}
          onClose={() => setRateOpen(false)}
          appointmentSid={appointment.sid}
          doctorName={appointment.doctor_name}
          existingReview={existingReview}
          onSaved={(saved) => setExistingReview(saved)}
        />
      )}
    </div>
  );
}
