'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  medicineOrders,
  branches as branchesApi,
  MedicineCatalogItem,
  BranchItem,
  MedicineOrderCreateResponse,
} from '@/lib/api';

interface BuyMedicineModalProps {
  isOpen: boolean;
  onClose: () => void;
  medication: MedicineCatalogItem | null;
  /**
   * Called after the backend confirms the order. The second argument is the
   * medication being purchased — kept so the caller can render a follow-up
   * PaymentModal without having to read stale state after this modal closes.
   */
  onSuccess: (response: MedicineOrderCreateResponse, medication: MedicineCatalogItem) => void;
}

type DeliveryMethod = 'pickup' | 'delivery';

/**
 * Modal used from the "Buy Medicine" tab. Creates a `MedicineOrder` for a single
 * medication with a chosen delivery method (pickup / delivery).
 *
 * The Rx-gating logic lives in the backend: if the medication requires a
 * prescription and the patient doesn't have an active one, the server returns
 * 403 and we surface a friendly message. If it's a free-when-prescribed med
 * and the patient does have an active Rx, the server returns `total=0` +
 * `status='Paid'` and we show a success message with a "covered" note.
 */
export default function BuyMedicineModal({
  isOpen,
  onClose,
  medication,
  onSuccess,
}: BuyMedicineModalProps) {
  const t = useTranslations('dashboard.patient.medicinePage');

  const [quantity, setQuantity] = useState(1);
  const [method, setMethod] = useState<DeliveryMethod>('pickup');
  const [branchSid, setBranchSid] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Reset state + load branches each time the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    setQuantity(1);
    setMethod('pickup');
    setBranchSid('');
    setDeliveryAddress('');
    setError('');
    setBranchesLoading(true);
    branchesApi
      .list()
      .then((list) => setBranches(list))
      .catch(() => setBranches([]))
      .finally(() => setBranchesLoading(false));
  }, [isOpen]);

  const isCovered = useMemo(() => {
    if (!medication) return false;
    // UI-side hint only. The server is the source of truth — we only use this
    // to render the "Covered by prescription" label optimistically; if the
    // server disagrees (e.g. no active Rx) we show the real message.
    return medication.requires_prescription && medication.free_when_prescribed;
  }, [medication]);

  const estimatedTotal = useMemo(() => {
    if (!medication) return '0.00';
    // If it's OTC or a paid prescription medication, show cost × qty.
    // If we *think* it'll be covered by Rx, show 0 — the server will confirm.
    if (isCovered) return '0.00';
    const cost = Number(medication.cost) || 0;
    return (cost * quantity).toFixed(2);
  }, [medication, quantity, isCovered]);

  const handleConfirm = async () => {
    if (!medication) return;
    setError('');

    if (method === 'pickup' && !branchSid) {
      setError(t('branchRequired'));
      return;
    }
    if (method === 'delivery' && !deliveryAddress.trim()) {
      setError(t('addressRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem('access_token') || '';
      const response = await medicineOrders.create(
        {
          items: [{ medication_sid: medication.sid, quantity }],
          delivery_method: method,
          branch_sid: method === 'pickup' ? branchSid : undefined,
          delivery_address: method === 'delivery' ? deliveryAddress.trim() : undefined,
        },
        token,
      );
      onSuccess(response, medication);
      onClose();
    } catch (err: unknown) {
      const apiError = err as { status?: number; data?: { detail?: string } };
      if (apiError.status === 403) {
        setError(apiError.data?.detail || t('requiresPrescriptionError'));
      } else {
        setError(apiError.data?.detail || t('genericError'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !medication) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              {t('buyModalTitle', { name: medication.name })}
            </h2>
            {medication.generic_name && (
              <p className="mt-0.5 text-xs text-gray-500">{medication.generic_name}</p>
            )}
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
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Quantity */}
          <div>
            <label className="block text-xs font-medium text-gray-700">{t('quantity')}</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
              disabled={submitting}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </div>

          {/* Delivery method */}
          <div>
            <label className="block text-xs font-medium text-gray-700">{t('deliveryMethod')}</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMethod('pickup')}
                disabled={submitting}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                  method === 'pickup'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t('methodPickup')}
              </button>
              <button
                type="button"
                onClick={() => setMethod('delivery')}
                disabled={submitting}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                  method === 'delivery'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t('methodDelivery')}
              </button>
            </div>
          </div>

          {/* Pickup branch */}
          {method === 'pickup' && (
            <div>
              <label className="block text-xs font-medium text-gray-700">{t('pickupBranch')}</label>
              <select
                value={branchSid}
                onChange={(e) => setBranchSid(e.target.value)}
                disabled={submitting || branchesLoading}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              >
                <option value="">{t('pickupBranchPlaceholder')}</option>
                {branches.map((b) => (
                  <option key={b.sid} value={b.sid}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Delivery address */}
          {method === 'delivery' && (
            <>
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {t('deliveryComingSoon')}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  {t('deliveryAddress')}
                </label>
                <textarea
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder={t('deliveryAddressPlaceholder')}
                  rows={2}
                  disabled={submitting}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
              </div>
            </>
          )}

          {/* Summary */}
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {t('orderSummary')}
            </p>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-gray-700">{t('estimatedTotal')}</span>
              {isCovered ? (
                <span className="font-semibold text-emerald-700">$0.00 · {t('covered')}</span>
              ) : (
                <span className="font-semibold text-gray-900">${estimatedTotal}</span>
              )}
            </div>
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
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? t('confirming') : t('confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
