'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { paymentFlow } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Loader2 } from 'lucide-react';

export default function PayPalSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    const paymentId = searchParams.get('paymentId');
    const payerId = searchParams.get('PayerID');
    const appointmentSid = searchParams.get('appointment');

    if (!paymentId || !payerId || !appointmentSid) { setError('Missing payment information.'); return; }

    const token = localStorage.getItem('access_token') || '';
    paymentFlow.paypalCaptureOrder({ payment_id: paymentId, payer_id: payerId, appointment_sid: appointmentSid }, token)
      .then(() => router.push(`/dashboard/patient/booking/success?appointment=${appointmentSid}`))
      .catch(() => setError('Payment capture failed. Please contact support.'));
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="mt-4 text-xl font-bold">Payment Error</h1>
            <p className="mt-2 text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
      <p className="mt-4 text-muted-foreground">Processing your PayPal payment...</p>
    </div>
  );
}
