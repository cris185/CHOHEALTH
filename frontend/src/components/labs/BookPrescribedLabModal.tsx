'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { bookPrescribedLab, branches as branchesApi, BranchItem } from '@/lib/api';

interface BookPrescribedLabModalProps {
  isOpen: boolean;
  onClose: () => void;
  labOrderSid: string | null;
  /** Fires after the backend confirms the booking. */
  onSuccess: () => void;
}

/**
 * Modal used from the "My Lab Orders" tab to book a FREE lab appointment for
 * a prescribed lab order. The backend endpoint `/appointments/book-prescribed-lab/`
 * creates an appointment + zero-cost invoice in one call.
 */
export default function BookPrescribedLabModal({
  isOpen,
  onClose,
  labOrderSid,
  onSuccess,
}: BookPrescribedLabModalProps) {
  const t = useTranslations('dashboard.patient.labsPage');

  const [dateTime, setDateTime] = useState('');
  const [branchSid, setBranchSid] = useState('');
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setDateTime('');
    setBranchSid('');
    setError('');
    setBranchesLoading(true);
    branchesApi
      .list()
      .then((list) => setBranches(list))
      .catch(() => setBranches([]))
      .finally(() => setBranchesLoading(false));
  }, [isOpen]);

  const handleConfirm = async () => {
    if (!labOrderSid) return;
    setError('');
    if (!dateTime) {
      setError(t('bookDateRequired'));
      return;
    }
    if (!branchSid) {
      setError(t('bookBranchRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const token = localStorage.getItem('access_token') || '';
      // datetime-local gives us a local ISO string without timezone. Pass it
      // through as-is — the backend stores naive datetimes and the existing
      // appointment endpoints accept this format.
      await bookPrescribedLab.create(labOrderSid, dateTime, branchSid, token);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const apiError = err as { data?: { detail?: string } };
      setError(apiError?.data?.detail || t('bookError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Limit picker to future dates only.
  const minDate = new Date();
  minDate.setMinutes(minDate.getMinutes() - minDate.getTimezoneOffset());
  const minDateStr = minDate.toISOString().slice(0, 16);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">{t('bookModalTitle')}</h2>
            <p className="mt-0.5 text-xs text-gray-500">{t('bookModalHint')}</p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700">{t('bookDate')}</label>
            <input
              type="datetime-local"
              value={dateTime}
              min={minDateStr}
              onChange={(e) => setDateTime(e.target.value)}
              disabled={submitting}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700">{t('bookBranch')}</label>
            <select
              value={branchSid}
              onChange={(e) => setBranchSid(e.target.value)}
              disabled={submitting || branchesLoading}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            >
              <option value="">{t('bookBranchPlaceholder')}</option>
              {branches.map((b) => (
                <option key={b.sid} value={b.sid}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t bg-gray-50 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {t('bookCancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? t('bookConfirming') : t('bookConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
