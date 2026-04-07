'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { paymentFlow } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { XCircle } from 'lucide-react';

export default function BookingCancelPage() {
  const searchParams = useSearchParams();
  const appointmentSid = searchParams.get('appointment');

  useEffect(() => {
    if (appointmentSid) {
      const token = localStorage.getItem('access_token') || '';
      paymentFlow.cancelPending(appointmentSid, token).catch(() => {});
    }
  }, [appointmentSid]);

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <Card>
        <CardContent className="py-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <XCircle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="mt-4 text-xl font-bold">Payment Cancelled</h1>
          <p className="mt-2 text-muted-foreground">Your payment was cancelled. You can try again anytime.</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/dashboard/patient/services"><Button>Browse Services</Button></Link>
            <Link href="/dashboard/patient"><Button variant="outline">Dashboard</Button></Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
