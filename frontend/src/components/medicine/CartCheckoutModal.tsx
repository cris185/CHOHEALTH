'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useCart, CartItem } from '@/context/CartContext';
import {
  medicineOrders,
  branches as branchesApi,
  BranchItem,
  MedicineOrderCreateResponse,
} from '@/lib/api';

interface CartCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Fires after the backend creates the order. The second argument tells
   *  the parent whether the patient picked delivery, so it can route to the
   *  tracking page after payment. */
  onSuccess: (response: MedicineOrderCreateResponse, method: DeliveryMethod) => void;
  /**
   * Set of medication sids for which the patient has an active unclaimed
   * prescription. Items in this set will display as "$0" in the summary.
   */
  freeMedicationSids: Set<string>;
}

type DeliveryMethod = 'pickup' | 'delivery';

export default function CartCheckoutModal({
  isOpen,
  onClose,
  onSuccess,
  freeMedicationSids,
}: CartCheckoutModalProps) {
  const t = useTranslations('dashboard.patient.medicinePage');
  const { items, count, clearCart, updateQuantity, removeItem } = useCart();

  const [method, setMethod] = useState<DeliveryMethod>('pickup');
  const [branchSid, setBranchSid] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setMethod('pickup');
    setBranchSid('');
    setDeliveryAddress('');
    setError('');
    setBranchesLoading(true);
    branchesApi.list()
      .then(setBranches)
      .catch(() => setBranches([]))
      .finally(() => setBranchesLoading(false));
  }, [isOpen]);

  /** Estimated total — $0 for items covered by Rx, regular cost otherwise. */
  const estimatedTotal = useMemo(() => {
    let sum = 0;
    for (const it of items) {
      const isFree = freeMedicationSids.has(it.medication.sid);
      if (!isFree) sum += Number(it.medication.cost) * it.quantity;
    }
    return sum;
  }, [items, freeMedicationSids]);

  const handleConfirm = async () => {
    if (count === 0) return;
    setError('');
    if (method === 'pickup' && !branchSid) { setError(t('branchRequired')); return; }
    if (method === 'delivery' && !deliveryAddress.trim()) { setError(t('addressRequired')); return; }

    setSubmitting(true);
    try {
      const token = localStorage.getItem('access_token') || '';
      const response = await medicineOrders.create(
        {
          items: items.map((it) => ({ medication_sid: it.medication.sid, quantity: it.quantity })),
          delivery_method: method,
          branch_sid: method === 'pickup' ? branchSid : undefined,
          delivery_address: method === 'delivery' ? deliveryAddress.trim() : undefined,
        },
        token,
      );
      clearCart();
      onSuccess(response, method);
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

  if (!isOpen || count === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-base font-bold text-gray-900">
            {t('cartCheckoutTitle')} ({count})
          </h2>
          <button onClick={onClose} disabled={submitting} className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-50" aria-label="Close">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          {/* Item list */}
          <div className="space-y-2">
            {items.map((it) => {
              const isFree = freeMedicationSids.has(it.medication.sid);
              return (
                <CartLineItem
                  key={it.medication.sid}
                  item={it}
                  isFree={isFree}
                  disabled={submitting}
                  onQuantity={(q) => updateQuantity(it.medication.sid, q)}
                  onRemove={() => removeItem(it.medication.sid)}
                  labels={{ free: t('covered'), remove: t('cancel') }}
                />
              );
            })}
          </div>

          {/* Delivery method */}
          <div>
            <label className="block text-xs font-medium text-gray-700">{t('deliveryMethod')}</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setMethod('pickup')} disabled={submitting}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${method === 'pickup' ? 'border-primary bg-primary/10 text-primary' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>
                {t('methodPickup')}
              </button>
              <button type="button" onClick={() => setMethod('delivery')} disabled={submitting}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${method === 'delivery' ? 'border-primary bg-primary/10 text-primary' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>
                {t('methodDelivery')}
              </button>
            </div>
          </div>

          {method === 'pickup' && (
            <div>
              <label className="block text-xs font-medium text-gray-700">{t('pickupBranch')}</label>
              <select value={branchSid} onChange={(e) => setBranchSid(e.target.value)} disabled={submitting || branchesLoading}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50">
                <option value="">{t('pickupBranchPlaceholder')}</option>
                {branches.map((b) => <option key={b.sid} value={b.sid}>{b.name}</option>)}
              </select>
            </div>
          )}

          {method === 'delivery' && (
            <>
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                {t('deliveryFreeNote')}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">{t('deliveryAddress')}</label>
                <textarea value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder={t('deliveryAddressPlaceholder')} rows={2} disabled={submitting}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50" />
              </div>
            </>
          )}

          {/* Summary */}
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t('orderSummary')}</p>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-gray-700">{t('estimatedTotal')}</span>
              {estimatedTotal === 0 ? (
                <span className="font-semibold text-emerald-700">$0.00 · {t('covered')}</span>
              ) : (
                <span className="font-semibold text-gray-900">${estimatedTotal.toFixed(2)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t bg-gray-50 px-5 py-4">
          <button type="button" onClick={onClose} disabled={submitting}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {t('cancel')}
          </button>
          <button type="button" onClick={handleConfirm} disabled={submitting || count === 0}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
            {submitting ? t('confirming') : t('confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

function CartLineItem({ item, isFree, disabled, onQuantity, onRemove, labels }: {
  item: CartItem;
  isFree: boolean;
  disabled: boolean;
  onQuantity: (q: number) => void;
  onRemove: () => void;
  labels: { free: string; remove: string };
}) {
  const lineTotal = isFree ? 0 : Number(item.medication.cost) * item.quantity;
  return (
    <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-white p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{item.medication.name}</p>
        {item.medication.strength && (
          <p className="text-xs text-gray-500">{item.medication.strength}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input type="number" min={1} value={item.quantity} disabled={disabled}
          onChange={(e) => onQuantity(Math.max(1, Number(e.target.value) || 1))}
          className="w-14 rounded border border-gray-300 px-2 py-1 text-center text-xs disabled:opacity-50" />
        <span className="w-16 text-right text-xs font-semibold">
          {isFree ? (
            <span className="text-emerald-700">{labels.free}</span>
          ) : (
            <span className="text-gray-900">${lineTotal.toFixed(2)}</span>
          )}
        </span>
        <button type="button" onClick={onRemove} disabled={disabled}
          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50" aria-label="Remove">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
