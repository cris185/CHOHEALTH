'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { paymentFlow } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';

export default function BookingSuccessPage() {
  const searchParams = useSearchParams();
  const appointmentSid = searchParams.get('appointment');
  const sessionId = searchParams.get('session_id');
  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!appointmentSid) { setVerifying(false); return; }
    const token = localStorage.getItem('access_token') || '';

    if (sessionId) {
      paymentFlow.stripeVerify(appointmentSid, sessionId, token)
        .then(() => setVerified(true))
        .catch((err) => {
          const apiError = err as { data?: { status?: string } };
          if (apiError?.data?.status === 'Pending') setVerified(true);
          else setError('Payment verification failed.');
        })
        .finally(() => setVerifying(false));
    } else {
      setVerified(true);
      setVerifying(false);
    }
  }, [appointmentSid, sessionId]);

  if (verifying) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Verifying your payment...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="mt-4 text-xl font-bold">Payment Issue</h1>
            <p className="mt-2 text-muted-foreground">{error}</p>
            <Link href="/dashboard/patient" className="mt-6 inline-block"><Button>Back to Dashboard</Button></Link>
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
          <h1 className="mt-4 text-xl font-bold">Appointment Booked!</h1>
          <p className="mt-2 text-muted-foreground">Your payment was successful and your appointment has been confirmed.</p>
          {appointmentSid && <p className="mt-2 text-xs text-muted-foreground">ID: {appointmentSid}</p>}
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/dashboard/patient/appointments"><Button>View Appointments</Button></Link>
            <Link href="/dashboard/patient"><Button variant="outline">Dashboard</Button></Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
