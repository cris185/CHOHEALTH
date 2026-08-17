'use client';

import { useState, useMemo } from 'react';

interface CancelAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointmentSid: string;
  appointmentDate: string;
  invoiceStatus: string | null;
  amount?: string;
  onCancel: (sid: string, reason: string) => Promise<void>;
  /** 'patient' uses tiered policy, 'doctor' always 100% refund */
  actorRole?: 'patient' | 'doctor';
}

/**
 * Confirmation modal for cancelling an appointment. Shows the expected refund
 * amount according to the cancellation policy BEFORE the user confirms.
 */
export default function CancelAppointmentModal({
  isOpen, onClose, appointmentSid, appointmentDate, invoiceStatus, amount, onCancel, actorRole = 'patient',
}: CancelAppointmentModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Calculate hours until appointment and expected refund %.
  // This modal is ONLY used for Confirmed (paid) appointments — Unpaid ones are
  // handled via the Delete flow, not Cancel. `invoiceStatus` is still accepted
  // as a prop for backward compatibility but we always assume payment was made.
  void invoiceStatus;
  const { hoursUntil, refundPercent, refundLabel } = useMemo(() => {
    const now = new Date();
    const apptDate = new Date(appointmentDate);
    const hours = (apptDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (actorRole === 'doctor') {
      return { hoursUntil: hours, refundPercent: 100, refundLabel: 'Full refund (doctor-initiated)' };
    }
    // Patient tiered policy
    if (hours >= 48) return { hoursUntil: hours, refundPercent: 100, refundLabel: '100% refund (more than 48 hours notice)' };
    if (hours >= 24) return { hoursUntil: hours, refundPercent: 50, refundLabel: '50% refund (24-48 hours notice)' };
    return { hoursUntil: hours, refundPercent: 0, refundLabel: 'No refund (less than 24 hours notice)' };
  }, [appointmentDate, actorRole]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    setError('');
    try {
      await onCancel(appointmentSid, reason.trim());
      onClose();
      setReason('');
    } catch (err: unknown) {
      const apiError = err as { data?: { detail?: string } };
      setError(apiError?.data?.detail || 'Could not cancel the appointment.');
    } finally {
      setSubmitting(false);
    }
  };

  const expectedRefund = amount && refundPercent > 0
    ? (Number(amount) * refundPercent / 100).toFixed(2)
    : '0.00';

  const refundColor = refundPercent === 100 ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
    : refundPercent === 50 ? 'text-amber-700 bg-amber-50 border-amber-200'
    : 'text-red-700 bg-red-50 border-red-200';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="border-b p-4">
          <h2 className="text-lg font-bold text-gray-900">Cancel Appointment</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {new Date(appointmentDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })}
          </p>
        </div>

        <div className="p-4 space-y-4">
          {error && <div className="rounded bg-red-50 p-3 text-sm text-red-600">{error}</div>}

          {/* Refund preview */}
          <div className={`rounded-lg border p-4 ${refundColor}`}>
            <p className="text-xs font-semibold uppercase tracking-wide">Refund Preview</p>
            <p className="text-2xl font-bold mt-1">
              ${expectedRefund}
              <span className="text-xs font-normal ml-2 opacity-75">({refundPercent}%)</span>
            </p>
            <p className="text-xs mt-1 opacity-90">{refundLabel}</p>
            {hoursUntil > 0 && actorRole === 'patient' && (
              <p className="text-[11px] mt-2 opacity-70">
                Appointment is in {Math.floor(hoursUntil)} hour{Math.floor(hoursUntil) !== 1 ? 's' : ''}.
              </p>
            )}
          </div>

          {/* Reason */}
          <div>
            <label htmlFor="cancel-reason" className="block text-xs font-medium text-gray-700 mb-1">
              Reason {actorRole === 'patient' ? '(optional)' : ''}
            </label>
            <textarea
              id="cancel-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Let us know why you're cancelling…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <p className="text-[11px] text-gray-500 leading-relaxed">
            Refunds typically take 5-10 business days to appear on your statement. This action cannot be undone.
          </p>
        </div>

        <div className="border-t p-4 flex gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Keep Appointment
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? 'Cancelling…' : 'Confirm Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
