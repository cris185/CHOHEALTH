'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  paymentFlow,
  medicineOrderPaymentFlow,
  paymentMethods,
  SavedCard,
  PaymentTarget,
} from '@/lib/api';
// NOTE: El retorno desde Stripe/PayPal vía botón "atrás" se reconcilia en las
// páginas que renderizan este modal usando el hook `useBfcacheRefetch`. No es
// necesario (ni deseable) empujar una ruta "segura" al historial antes del
// `window.location.href`: hacerlo abre una race condition entre el mount que
// Next.js dispara y el `unload` hacia el gateway, dejando la página
// siguiente atrapada en `loading=true` dentro del bfcache.

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Discriminated union describing what we are charging for:
   *  - `{ kind: 'appointment', appointmentSid }` — the classic booking flow.
   *  - `{ kind: 'medicine_order', orderSid }` — the medicine shop flow (Paso 4).
   *
   * The saved-card (one-click) flow is only supported for appointments — for
   * medicine orders the modal shows Stripe Checkout + PayPal redirect only.
   */
  target: PaymentTarget;
  amount: string;
  serviceName: string;
  /** Fired after a saved-card payment succeeds (appointment flow only). */
  onSuccess?: () => void;
  /** Title shown in the header. Defaults to "Select Payment Method". */
  title?: string;
  /** Subtitle shown below the title (e.g., the appointment date). */
  subtitle?: string;
}

/**
 * Standalone payment modal used in two flows:
 *  1. Appointment payments — historic flow (BookingModal + Pay Now on unpaid appts).
 *  2. Medicine order payments — added in Paso 4.
 *
 * Handles saved cards (appointment only), new Stripe Checkout, PayPal redirect,
 * and the "save card for future payments" checkbox.
 */
export default function PaymentModal({
  isOpen, onClose, target, amount, serviceName, onSuccess, title, subtitle,
}: PaymentModalProps) {
  const router = useRouter();
  const isAppointment = target.kind === 'appointment';
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [saveCard, setSaveCard] = useState(false);
  const [selectedOtherCard, setSelectedOtherCard] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      // Asegura que el modal nunca quede en "Redirecting…" si el usuario
      // vuelve con el botón atrás del navegador desde Stripe/PayPal.
      setLoading(false);
      setError('');
      // Saved cards are only meaningful for the appointment flow. For
      // medicine-order payments we skip the list call and render Stripe/PayPal
      // directly without the "one-click" section.
      if (isAppointment) {
        const token = localStorage.getItem('access_token') || '';
        paymentMethods.listCards(token)
          .then((cards) => {
            const sorted = [...cards].sort((a, b) => Number(b.is_default) - Number(a.is_default));
            setSavedCards(sorted);
          })
          .catch(() => setSavedCards([]));
      } else {
        setSavedCards([]);
      }
    } else {
      setSelectedOtherCard('');
      setSaveCard(false);
      setError('');
    }
  }, [isOpen, isAppointment]);

  // Si el navegador restaura esta página desde el bfcache mientras el modal
  // estaba abierto en estado "Redirecting to payment…", reseteamos `loading`
  // para que no quede atascado mostrando el spinner.
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => {
      if (e.persisted) setLoading(false);
    };
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  if (!isOpen) return null;

  const handleStripe = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('access_token') || '';
      const res =
        target.kind === 'appointment'
          ? await paymentFlow.stripeCheckout(target.appointmentSid, token, saveCard)
          : await medicineOrderPaymentFlow.stripeCheckout(target.orderSid, token);
      // Navegación directa al gateway. Las páginas que renderizan este modal
      // usan `useBfcacheRefetch` para reconciliar su estado al volver.
      window.location.href = res.checkout_url;
    } catch (err: unknown) {
      const apiError = err as { data?: { detail?: string } };
      setError(apiError?.data?.detail || 'Error creating Stripe session.');
      setLoading(false);
    }
  };

  const handleSavedCardPay = async (paymentMethodId: string) => {
    // Saved-card one-click is only supported for appointments for now.
    if (target.kind !== 'appointment') return;
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('access_token') || '';
      await paymentFlow.stripeSavedCardPay(target.appointmentSid, paymentMethodId, token);
      if (onSuccess) {
        onSuccess();
      } else {
        router.push(`/dashboard/patient/booking/success?appointment=${target.appointmentSid}`);
      }
    } catch (err: unknown) {
      const apiError = err as { data?: { detail?: string } };
      setError(apiError?.data?.detail || 'Payment failed.');
      setLoading(false);
    }
  };

  const handlePayPal = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('access_token') || '';
      const res =
        target.kind === 'appointment'
          ? await paymentFlow.paypalCreateOrder(target.appointmentSid, token)
          : await medicineOrderPaymentFlow.paypalCreateOrder(target.orderSid, token);
      window.location.href = res.approval_url;
    } catch (err: unknown) {
      const apiError = err as { data?: { detail?: string } };
      setError(apiError?.data?.detail || 'Error creating PayPal order.');
      setLoading(false);
    }
  };

  const defaultCard = savedCards.find((c) => c.is_default);
  const otherCards = savedCards.filter((c) => !c.is_default);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title || 'Select Payment Method'}</h2>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} disabled={loading} className="rounded p-1 hover:bg-gray-100 disabled:opacity-50">
            <svg className="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

          {/* Amount display */}
          <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 border p-6 text-center">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total to pay</p>
            <p className="text-4xl font-bold tracking-tight mt-2">${amount}</p>
            <p className="mt-2 text-sm text-muted-foreground">{serviceName}</p>
          </div>

          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground text-center">Choose payment method</p>

          <div className="space-y-3">
            {/* Saved cards */}
            {savedCards.length > 0 && (
              <div className="space-y-2">
                {defaultCard && (
                  <>
                    <p className="text-xs font-medium text-muted-foreground">Default Card · One-click pay</p>
                    <button
                      key={defaultCard.id}
                      onClick={() => handleSavedCardPay(defaultCard.id)}
                      disabled={loading}
                      className="group relative flex w-full items-center gap-4 rounded-xl border-2 border-primary bg-primary/5 px-5 py-4 transition-all duration-200 hover:bg-primary/10 hover:shadow-md disabled:opacity-50"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                        <svg className="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                        </svg>
                      </div>
                      <div className="text-left flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold capitalize">Pay with {defaultCard.brand} •••• {defaultCard.last4}</p>
                          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">Default</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Expires {String(defaultCard.exp_month).padStart(2, '0')}/{defaultCard.exp_year}</p>
                      </div>
                      <svg className="h-5 w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </>
                )}

                {otherCards.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      {defaultCard ? 'Or use another saved card' : 'Saved Cards'}
                    </p>
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedOtherCard}
                        onChange={(e) => setSelectedOtherCard(e.target.value)}
                        disabled={loading}
                        className="flex-1 min-w-0 rounded-xl border-2 border-border bg-white px-4 py-3 text-sm font-medium capitalize shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                      >
                        <option value="">Select a card…</option>
                        {otherCards.map((card) => (
                          <option key={card.id} value={card.id}>
                            {card.brand} •••• {card.last4} — exp {String(card.exp_month).padStart(2, '0')}/{String(card.exp_year).slice(-2)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => selectedOtherCard && handleSavedCardPay(selectedOtherCard)}
                        disabled={loading || !selectedOtherCard}
                        className="shrink-0 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Pay
                      </button>
                    </div>
                  </div>
                )}

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
                  <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-muted-foreground">or pay with</span></div>
                </div>
              </div>
            )}

            {/* Stripe (new card) */}
            <button
              onClick={handleStripe}
              disabled={loading}
              className="group flex w-full items-center gap-4 rounded-xl border-2 border-border px-5 py-4 transition-all duration-200 hover:border-[#635BFF] hover:bg-[#635BFF]/5 hover:shadow-sm disabled:opacity-50"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#635BFF]/10 group-hover:bg-[#635BFF]/20 transition-colors">
                <svg className="h-6 w-6" viewBox="0 0 32 32" fill="none">
                  <path fillRule="evenodd" clipRule="evenodd" d="M14.903 11.2c0-1.12.921-1.554 2.449-1.554 2.19 0 4.953.663 7.143 1.846V4.87C22.229 3.94 20.008 3.2 17.352 3.2 11.627 3.2 8 6.16 8 10.88c0 7.291 10.034 6.131 10.034 9.28 0 1.326-1.152 1.754-2.766 1.754-2.392 0-5.443-.983-7.862-2.309v6.72C9.94 27.52 12.55 28.8 15.268 28.8c5.869 0 9.903-2.902 9.903-7.68-.029-7.866-10.268-6.474-10.268-9.92z" fill="#635BFF"/>
                </svg>
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-semibold text-foreground">Pay with Card</p>
                <p className="text-xs text-muted-foreground">Visa, Mastercard, Amex & more</p>
              </div>
              <svg className="h-5 w-5 text-muted-foreground/40 group-hover:text-[#635BFF] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Save card checkbox — appointments only */}
            {isAppointment && (
              <label className="flex items-center gap-2 cursor-pointer px-1">
                <input type="checkbox" checked={saveCard} onChange={(e) => setSaveCard(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
                <span className="text-xs text-muted-foreground">Save my card for future payments</span>
              </label>
            )}

            {/* PayPal */}
            <button
              onClick={handlePayPal}
              disabled={loading}
              className="group flex w-full items-center gap-4 rounded-xl border-2 border-border px-5 py-4 transition-all duration-200 hover:border-[#0070BA] hover:bg-[#0070BA]/5 hover:shadow-sm disabled:opacity-50"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0070BA]/10 group-hover:bg-[#0070BA]/20 transition-colors">
                <svg className="h-6 w-6" viewBox="0 0 32 32" fill="none">
                  <path d="M25.7 9.7c.3 1.8 0 3-1 4.2-1.2 1.3-3.3 1.9-5.8 1.9h-.8c-.4 0-.8.3-.9.7l-.5 3.4-.2 1c0 .3-.3.6-.6.6h-3.3c-.3 0-.5-.3-.4-.6l.1-.4 1.2-7.6.1-.4c.1-.4.5-.7.9-.7h1.9c3.8 0 6.8-1.5 7.6-6 .1-.3.1-.6.2-.8.6.4 1.2.9 1.5 1.7z" fill="#009CDE"/>
                  <path d="M24.2 8c-.4-1.1-1.4-2-2.8-2.5-.7-.3-1.5-.4-2.4-.4h-7.4c-.4 0-.8.3-.9.7l-3.1 19.4c0 .4.2.7.6.7h4.4l1.1-7-.1.2c.1-.4.5-.7.9-.7h1.8c3.6 0 6.4-1.5 7.2-5.7 0-.1 0-.3.1-.4.2-1.4.2-2.5-.4-3.3z" fill="#003087"/>
                </svg>
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-semibold text-foreground">Pay with PayPal</p>
                <p className="text-xs text-muted-foreground">Fast & secure checkout</p>
              </div>
              <svg className="h-5 w-5 text-muted-foreground/40 group-hover:text-[#0070BA] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Redirecting to payment…
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4">
          <button
            onClick={onClose}
            disabled={loading}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
