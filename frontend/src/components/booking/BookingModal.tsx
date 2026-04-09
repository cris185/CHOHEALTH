'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { paymentFlow, paymentMethods, branches as branchesApi, BranchItem, CreateAppointmentResponse, SavedCard } from '@/lib/api';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  doctorSid: string;
  serviceSid: string;
  date: string;
  time: string;
  doctorName: string;
  serviceName: string;
  serviceDuration: number;
  serviceCost: string;
}

type Step = 'form' | 'payment';

export default function BookingModal({
  isOpen, onClose, doctorSid, serviceSid, date, time, doctorName, serviceName, serviceDuration, serviceCost,
}: BookingModalProps) {
  const t = useTranslations();
  const router = useRouter();

  const [step, setStep] = useState<Step>('form');
  const [mode, setMode] = useState('In-Person');
  const [branchSid, setBranchSid] = useState('');
  const [branchesList, setBranchesList] = useState<BranchItem[]>([]);
  const [issues, setIssues] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [appointmentData, setAppointmentData] = useState<CreateAppointmentResponse | null>(null);
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [saveCard, setSaveCard] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const token = localStorage.getItem('access_token') || '';
      paymentMethods.listCards(token).then(setSavedCards).catch(() => setSavedCards([]));
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && mode === 'In-Person') {
      branchesApi.list().then(setBranchesList).catch(() => {});
    }
  }, [isOpen, mode]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setStep('form');
      setAppointmentData(null);
      setError('');
      setMode('In-Person');
      setBranchSid('');
      setIssues('');
      setSymptoms('');
      setNotes('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const dateTime = `${date}T${time}:00`;
  const formattedDate = new Date(dateTime).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const handleCreateAppointment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const token = localStorage.getItem('access_token');
    if (!token) { setError('Not authenticated.'); setLoading(false); return; }

    try {
      const res = await paymentFlow.createAppointment({
        doctor_sid: doctorSid,
        service_sid: serviceSid,
        date: dateTime,
        mode,
        branch_sid: mode === 'In-Person' ? branchSid : '',
        issues,
        symptoms,
        notes,
      }, token);

      setAppointmentData(res);
      setStep('payment');
    } catch (err: unknown) {
      const apiError = err as { data?: Record<string, string[]> };
      if (apiError?.data) {
        const messages = Object.values(apiError.data).flat().join(' ');
        setError(messages || t('booking.error'));
      } else {
        setError(t('booking.error'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStripePayment = async () => {
    if (!appointmentData) return;
    setLoading(true);
    setError('');

    const token = localStorage.getItem('access_token') || '';
    try {
      const res = await paymentFlow.stripeCheckout(appointmentData.appointment_sid, token, saveCard);
      window.location.href = res.checkout_url;
    } catch {
      setError('Error creating Stripe session.');
      setLoading(false);
    }
  };

  const handleSavedCardPayment = async (paymentMethodId: string) => {
    if (!appointmentData) return;
    setLoading(true);
    setError('');

    const token = localStorage.getItem('access_token') || '';
    try {
      await paymentFlow.stripeSavedCardPay(appointmentData.appointment_sid, paymentMethodId, token);
      router.push(`/dashboard/patient/booking/success?appointment=${appointmentData.appointment_sid}`);
    } catch (err: unknown) {
      const apiError = err as { data?: { detail?: string } };
      setError(apiError?.data?.detail || 'Payment failed.');
      setLoading(false);
    }
  };

  const handlePayPalPayment = async () => {
    if (!appointmentData) return;
    setLoading(true);
    setError('');

    const token = localStorage.getItem('access_token') || '';
    try {
      const res = await paymentFlow.paypalCreateOrder(appointmentData.appointment_sid, token);
      window.location.href = res.approval_url;
    } catch {
      setError('Error creating PayPal order.');
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (appointmentData) {
      const token = localStorage.getItem('access_token') || '';
      await paymentFlow.cancelPending(appointmentData.appointment_sid, token).catch(() => {});
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {step === 'form' ? t('booking.confirmBooking') : 'Select Payment Method'}
            </h2>
            <p className="text-sm text-gray-500">{formattedDate} &middot; {time}</p>
          </div>
          <button onClick={handleCancel} className="rounded p-1 hover:bg-gray-100">
            <svg className="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step 1: Booking Form */}
        {step === 'form' && (
          <form onSubmit={handleCreateAppointment} className="p-4 space-y-4">
            {error && <div className="rounded bg-red-50 p-3 text-sm text-red-600">{error}</div>}

            <div className="grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-3 text-sm">
              <div>
                <span className="text-gray-500">{t('booking.doctor')}:</span>
                <p className="font-medium text-gray-900">{doctorName}</p>
              </div>
              <div>
                <span className="text-gray-500">{t('booking.service')}:</span>
                <p className="font-medium text-gray-900">{serviceName}</p>
              </div>
              <div>
                <span className="text-gray-500">{t('booking.duration')}:</span>
                <p className="font-medium text-gray-900">{serviceDuration} min</p>
              </div>
              <div>
                <span className="text-gray-500">Price:</span>
                <p className="font-medium text-gray-900">${serviceCost}</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">{t('booking.mode')}</label>
              <div className="mt-1 flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="mode" value="In-Person" checked={mode === 'In-Person'} onChange={(e) => setMode(e.target.value)} className="text-blue-600" />
                  <span className="text-sm">{t('booking.inPerson')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="mode" value="Virtual" checked={mode === 'Virtual'} onChange={(e) => setMode(e.target.value)} className="text-blue-600" />
                  <span className="text-sm">{t('booking.virtual')}</span>
                </label>
              </div>
            </div>

            {mode === 'In-Person' && (
              <div>
                <label htmlFor="branch" className="block text-sm font-medium text-gray-700">{t('booking.branch')}</label>
                <select id="branch" value={branchSid} onChange={(e) => setBranchSid(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="">{t('booking.selectBranch')}</option>
                  {branchesList.map((b) => (
                    <option key={b.sid} value={b.sid}>{b.name} - {b.address}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="issues" className="block text-sm font-medium text-gray-700">{t('booking.issues')}</label>
              <textarea id="issues" rows={2} value={issues} onChange={(e) => setIssues(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>

            <div>
              <label htmlFor="symptoms" className="block text-sm font-medium text-gray-700">{t('booking.symptoms')}</label>
              <textarea id="symptoms" rows={2} value={symptoms} onChange={(e) => setSymptoms(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>

            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700">{t('booking.notes')}</label>
              <textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>

            <button type="submit" disabled={loading}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {loading ? t('booking.submitting') : 'Continue to Payment'}
            </button>
          </form>
        )}

        {/* Step 2: Payment Selection */}
        {step === 'payment' && appointmentData && (
          <div className="p-5 space-y-5">
            {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

            {/* Amount Display */}
            <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 border p-6 text-center">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total to pay</p>
              <p className="text-4xl font-bold tracking-tight mt-2">${appointmentData.amount}</p>
              <p className="mt-2 text-sm text-muted-foreground">{appointmentData.service_name}</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Invoice: {appointmentData.invoice_number}</p>
            </div>

            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground text-center">Choose payment method</p>

            <div className="space-y-3">
              {/* Saved Cards */}
              {savedCards.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Saved Cards</p>
                  {savedCards.map((card) => (
                    <button
                      key={card.id}
                      onClick={() => handleSavedCardPayment(card.id)}
                      disabled={loading}
                      className="group flex w-full items-center gap-4 rounded-xl border-2 border-border px-5 py-3 transition-all duration-200 hover:border-primary hover:bg-primary/5 hover:shadow-sm disabled:opacity-50"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 group-hover:bg-primary/10 transition-colors">
                        <svg className="h-5 w-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                        </svg>
                      </div>
                      <div className="text-left flex-1">
                        <p className="text-sm font-semibold capitalize">{card.brand} •••• {card.last4}</p>
                        <p className="text-xs text-muted-foreground">Expires {String(card.exp_month).padStart(2, '0')}/{card.exp_year} {card.is_default ? '(Default)' : ''}</p>
                      </div>
                      <svg className="h-5 w-5 text-muted-foreground/40 group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ))}
                  <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
                    <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-muted-foreground">or pay with</span></div>
                  </div>
                </div>
              )}

              {/* Stripe (new card) */}
              <button
                onClick={handleStripePayment}
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

              {/* Save card checkbox */}
              <label className="flex items-center gap-2 cursor-pointer px-1">
                <input type="checkbox" checked={saveCard} onChange={(e) => setSaveCard(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
                <span className="text-xs text-muted-foreground">Save my card for future payments</span>
              </label>

              {/* PayPal */}
              <button
                onClick={handlePayPalPayment}
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

            <button onClick={handleCancel}
              className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              Cancel
            </button>

            {loading && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Redirecting to payment...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}