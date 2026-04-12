'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { medicineOrderPaymentFlow } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Loader2 } from 'lucide-react';

/**
 * PayPal redirect lands here with `paymentId`, `PayerID` and `order`.
 * We immediately capture the payment server-side, then bounce the user to the
 * medicine payment success page which shows the confirmation card.
 */
export default function MedicinePayPalSuccessPage() {
  const t = useTranslations('dashboard.patient.medicinePaymentPages');
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    const paymentId = searchParams.get('paymentId');
    const payerId = searchParams.get('PayerID');
    const orderSid = searchParams.get('order');

    if (!paymentId || !payerId || !orderSid) {
      setError(t('paypalMissingInfo'));
      return;
    }

    const token = localStorage.getItem('access_token') || '';
    medicineOrderPaymentFlow
      .paypalCaptureOrder(
        { payment_id: paymentId, payer_id: payerId, order_sid: orderSid },
        token,
      )
      .then(() => router.push(`/dashboard/patient/medicine/payment/success?order=${orderSid}`))
      .catch(() => setError(t('paypalCaptureError')));
  }, [searchParams, router, t]);

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="mt-4 text-xl font-bold">{t('errorTitle')}</h1>
            <p className="mt-2 text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
      <p className="mt-4 text-muted-foreground">{t('paypalProcessing')}</p>
    </div>
  );
}
