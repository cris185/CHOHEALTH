'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { medicineDelivery, PrescriptionDeliveryCreateResponse } from '@/lib/api';
import { Truck } from 'lucide-react';

interface RequestDeliveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  prescriptionSid: string | null;
  /** Fires after the backend creates the bundled delivery order. Returns the
   *  order sid so the parent can open the PaymentModal for the shipping fee. */
  onCreated: (response: PrescriptionDeliveryCreateResponse) => void;
}

/**
 * Bundles every unclaimed hospital-covered medication in a prescription into
 * a single delivery order. The patient only pays the flat shipping fee —
 * the medicines themselves are covered by the Rx.
 */
export default function RequestDeliveryModal({
  isOpen, onClose, prescriptionSid, onCreated,
}: RequestDeliveryModalProps) {
  const t = useTranslations('dashboard.patient.medicinePage');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setAddress('');
      setError('');
      setSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen || !prescriptionSid) return null;

  const handleSubmit = async () => {
    if (!address.trim()) { setError(t('addressRequired')); return; }
    setSubmitting(true);
    setError('');
    try {
      const token = localStorage.getItem('access_token') || '';
      const response = await medicineDelivery.createFromPrescription(
        prescriptionSid, address.trim(), token,
      );
      onCreated(response);
      onClose();
    } catch (err: unknown) {
      const apiError = err as { data?: { detail?: string } };
      setError(apiError.data?.detail || t('genericError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold text-gray-900">{t('requestDeliveryTitle')}</h2>
          </div>
          <button onClick={onClose} disabled={submitting} className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-50" aria-label="Close">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <p className="text-sm text-gray-600">{t('requestDeliveryDescription')}</p>

          <div>
            <label className="block text-xs font-medium text-gray-700">{t('deliveryAddress')}</label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t('deliveryAddressPlaceholder')}
              rows={3}
              disabled={submitting}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </div>

          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-700">{t('medicines')}</span>
              <span className="font-semibold text-emerald-700">{t('covered')}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-gray-700">{t('shippingFee')}</span>
              <span className="font-semibold text-gray-900">$10.00</span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2 text-sm">
              <span className="font-semibold text-gray-900">{t('totalToPay')}</span>
              <span className="font-bold text-gray-900">$10.00</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t bg-gray-50 px-5 py-4">
          <button type="button" onClick={onClose} disabled={submitting}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {t('cancel')}
          </button>
          <button type="button" onClick={handleSubmit} disabled={submitting || !address.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
            {submitting ? t('confirming') : t('continueToPayment')}
          </button>
        </div>
      </div>
    </div>
  );
}
