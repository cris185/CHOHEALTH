'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { medicineOrderPaymentFlow, medicineOrders } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';

/**
 * Landing page after Stripe Checkout for a `MedicineOrder` returns successfully.
 * Verifies the session against the backend as a fallback for the webhook, then
 * either shows a confirmation card or an error.
 */
export default function MedicinePaymentSuccessPage() {
  const t = useTranslations('dashboard.patient.medicinePaymentPages');
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderSid = searchParams.get('order');
  const sessionId = searchParams.get('session_id');
  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orderSid) {
      setVerifying(false);
      return;
    }
    const token = localStorage.getItem('access_token') || '';

    // After verifying the payment, check the delivery method. Delivery orders
    // get pushed straight to the tracking page (the user cares about the
    // courier progress, not a generic "payment successful" screen). Pickup
    // orders stay on this page so the patient sees the QR/pickup code flow.
    const routeAfterVerify = async () => {
      try {
        const detail = await medicineOrders.detail(orderSid, token);
        if (detail.delivery_method === 'delivery') {
          router.replace(`/dashboard/patient/delivery/${orderSid}`);
          return true;
        }
      } catch {
        // Fall through to the normal success card.
      }
      return false;
    };

    const run = async () => {
      if (sessionId) {
        try {
          await medicineOrderPaymentFlow.stripeVerify(orderSid, sessionId, token);
          const redirected = await routeAfterVerify();
          if (!redirected) { setVerified(true); setVerifying(false); }
        } catch (err: unknown) {
          const apiError = err as { data?: { detail?: string; status?: string } };
          if (apiError?.data?.status === 'Paid') {
            const redirected = await routeAfterVerify();
            if (!redirected) { setVerified(true); setVerifying(false); }
          } else {
            setError(apiError?.data?.detail || t('verifyError'));
            setVerifying(false);
          }
        }
      } else {
        // No session_id: webhook probably completed first. Still peek at the
        // order to route delivery ones to tracking.
        const redirected = await routeAfterVerify();
        if (!redirected) { setVerified(true); setVerifying(false); }
      }
    };

    run();
  }, [orderSid, sessionId, t, router]);

  if (verifying) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">{t('verifying')}</p>
      </div>
    );
  }

  if (error || !verified) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="mt-4 text-xl font-bold">{t('errorTitle')}</h1>
            <p className="mt-2 text-muted-foreground">{error || t('verifyError')}</p>
            <Link href="/dashboard/patient/medicine" className="mt-6 inline-block">
              <Button>{t('backToMedicine')}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <Card>
        <CardContent className="py-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle className="h-8 w-8 text-emerald-600" />
          </div>
          <h1 className="mt-4 text-xl font-bold">{t('successTitle')}</h1>
          <p className="mt-2 text-muted-foreground">{t('successMessage')}</p>
          {orderSid && <p className="mt-2 text-xs text-muted-foreground">ID: {orderSid}</p>}
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/dashboard/patient/medicine">
              <Button>{t('viewOrders')}</Button>
            </Link>
            <Link href="/dashboard/patient">
              <Button variant="outline">{t('dashboard')}</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
