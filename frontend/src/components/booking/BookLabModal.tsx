'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  labTestsCatalog,
  branches as branchesApi,
  BranchItem,
  LabTestDetail,
  LabStaffItem,
  BookLabResponse,
} from '@/lib/api';
import PaymentModal from './PaymentModal';

interface BookLabModalProps {
  isOpen: boolean;
  onClose: () => void;
  labTest: LabTestDetail;
  staff: LabStaffItem;
  date: string;   // YYYY-MM-DD
  time: string;   // HH:MM
}

type Step = 'form' | 'payment' | 'success';

/**
 * Lab booking confirmation modal. Mirrors `BookingModal` but for the direct
 * lab-booking flow (LabTest + lab staff member instead of Service + doctor).
 *
 * Three terminal outcomes:
 *  - Lab is covered by an active prescription → free → `status='success'` and
 *    we show a confirmation card; no PaymentModal.
 *  - Lab needs payment → `status='payment'` → PaymentModal opens with target
 *    `{kind:'appointment', appointmentSid}` (reuses the existing flow).
 *  - The patient closes the modal mid-form.
 */
export default function BookLabModal({
  isOpen, onClose, labTest, staff, date, time,
}: BookLabModalProps) {
  const t = useTranslations();
  const router = useRouter();

  const [step, setStep] = useState<Step>('form');
  const [branchSid, setBranchSid] = useState('');
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState<BookLabResponse | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setStep('form');
      setBranchSid('');
      setError('');
      setResponse(null);
      return;
    }
    branchesApi.list().then(setBranches).catch(() => setBranches([]));
  }, [isOpen]);

  if (!isOpen) return null;

  const dateTime = `${date}T${time}:00`;
  const formattedDate = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
  });

  const handleConfirm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    if (!branchSid) { setError(t('booking.selectBranch')); return; }

    const token = localStorage.getItem('access_token');
    if (!token) { setError('Not authenticated.'); return; }

    setLoading(true);
    try {
      const res = await labTestsCatalog.book(
        {
          lab_test_sid: labTest.sid,
          staff_sid: staff.sid,
          date: dateTime,
          branch_sid: branchSid,
        },
        token,
      );
      setResponse(res);
      // If the lab was free (covered by Rx) the backend returned status=Confirmed
      // and there's no payment to do.
      if (res.status === 'Confirmed') {
        setStep('success');
      } else {
        setStep('payment');
      }
    } catch (err: unknown) {
      const apiError = err as { status?: number; data?: { detail?: string } };
      if (apiError.status === 403) {
        setError(apiError.data?.detail || t('booking.requiresPrescriptionError'));
      } else {
        setError(apiError.data?.detail || t('booking.error'));
      }
    } finally {
      setLoading(false);
    }
  };

  // Step 2: payment — render PaymentModal directly
  if (step === 'payment' && response) {
    return (
      <PaymentModal
        isOpen={true}
        onClose={onClose}
        target={{ kind: 'appointment', appointmentSid: response.appointment_sid }}
        amount={response.amount}
        serviceName={response.lab_test_name}
        subtitle={`${formattedDate} · ${time}`}
        onSuccess={() => router.push(`/dashboard/patient/booking/success?appointment=${response.appointment_sid}`)}
      />
    );
  }

  // Step 3: success (free booking)
  if (step === 'success' && response) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
          <div className="p-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <svg className="h-8 w-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="mt-4 text-lg font-bold text-gray-900">{t('booking.labBookedFree')}</h2>
            <p className="mt-2 text-sm text-gray-600">{t('booking.labBookedFreeMsg')}</p>
            <p className="mt-3 text-xs text-gray-400">{response.lab_test_name} · {formattedDate} · {time}</p>
            <button
              type="button"
              onClick={() => { onClose(); router.push('/dashboard/patient/appointments'); }}
              className="mt-6 w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {t('booking.viewMyAppointments')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 1: form
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">{t('booking.confirmLabBooking')}</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {labTest.name} &middot; {formattedDate} &middot; {time}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleConfirm} className="space-y-4 px-5 py-4">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700">{t('booking.branch')}</label>
            <select
              value={branchSid}
              onChange={(e) => setBranchSid(e.target.value)}
              disabled={loading}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            >
              <option value="">{t('booking.selectBranch')}</option>
              {branches.map((b) => (
                <option key={b.sid} value={b.sid}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-700">{t('booking.totalToPay')}</span>
              <span className="font-semibold text-gray-900">${labTest.cost}</span>
            </div>
            <p className="mt-1 text-[11px] text-gray-500">
              {t('booking.coveredIfRxNote')}
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {t('booking.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading || !branchSid}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? t('booking.submitting') : t('booking.confirmBooking')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
